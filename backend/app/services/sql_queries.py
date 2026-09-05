"""Read models for the SQL workspace."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import iso, utc_now
from app.db.models.delivery import Delivery, DeliveryAttempt
from app.db.models.integration import Integration
from app.db.models.lead import Lead
from app.db.models.routing import RoutingDecision


def _lead_item(lead: Lead, destination: str, delivery_status: str) -> dict[str, Any]:
    return {
        "id": lead.id,
        "public_id": lead.public_id,
        "first_name": lead.first_name or "",
        "last_name": lead.last_name or "",
        "company": lead.company or "",
        "service": lead.service or "",
        "source": lead.source or "",
        "status": lead.status,
        "created_at": iso(lead.created_at),
        "destination": destination,
        "delivery_status": delivery_status,
        "duplicate": bool(lead.duplicate_of_id),
        "country": lead.country or "",
        "email": lead.email or "",
    }


async def list_leads_sql(session: AsyncSession, user_id: str, params: dict[str, Any]) -> dict[str, Any]:
    leads = (await session.scalars(select(Lead).where(Lead.user_id == user_id))).all()
    decisions = (await session.scalars(select(RoutingDecision).where(RoutingDecision.user_id == user_id))).all()
    deliveries = (await session.scalars(select(Delivery).where(Delivery.user_id == user_id))).all()
    integrations = (await session.scalars(select(Integration).where(Integration.user_id == user_id))).all()
    int_map = {i.id: i for i in integrations}
    dec_map = {d.lead_id: d for d in decisions}
    del_map = {d.lead_id: d for d in deliveries}
    items = []
    for lead in leads:
        dec = dec_map.get(lead.id)
        dest = int_map[dec.integration_id].name if dec and dec.integration_id in int_map else ""
        dlv = del_map.get(lead.id)
        items.append(_lead_item(lead, dest, dlv.status if dlv else ""))
    q = (params.get("q") or "").strip().lower()
    if q:
        items = [
            row
            for row in items
            if q
            in " ".join(
                [row["public_id"], row["first_name"], row["last_name"], row["company"], row["email"], row["service"]]
            ).lower()
        ]
    if params.get("status"):
        items = [row for row in items if row["status"] == params["status"]]
    dup = params.get("duplicate") or "all"
    if dup == "yes":
        items = [row for row in items if row["duplicate"]]
    elif dup == "no":
        items = [row for row in items if not row["duplicate"]]
    for key in ("source", "service", "country", "destination"):
        if params.get(key):
            items = [row for row in items if row.get(key) == params[key]]
    if params.get("delivery_status"):
        items = [row for row in items if row["delivery_status"] == params["delivery_status"]]
    sort = params.get("sort") or "created_at"
    reverse = (params.get("dir") or "desc") != "asc"
    items.sort(key=lambda r: r.get(sort) or "", reverse=reverse)
    total = len(items)
    page = int(params.get("page") or 1)
    page_size = int(params.get("page_size") or 12)
    start = (page - 1) * page_size
    facets = {
        "source": sorted({row["source"] for row in items if row["source"]}),
        "service": sorted({row["service"] for row in items if row["service"]}),
        "country": sorted({row["country"] for row in items if row["country"]}),
        "destination": sorted({row["destination"] for row in items if row["destination"]}),
    }
    return {
        "items": items[start : start + page_size],
        "total": total,
        "page": page,
        "page_size": page_size,
        "facets": facets,
    }


async def dashboard_sql(session: AsyncSession, user_id: str) -> dict[str, Any]:
    leads = (await session.scalars(select(Lead).where(Lead.user_id == user_id))).all()
    deliveries = (await session.scalars(select(Delivery).where(Delivery.user_id == user_id))).all()
    attempts = (await session.scalars(select(DeliveryAttempt).where(DeliveryAttempt.user_id == user_id))).all()
    total = len(leads)
    qualified = sum(1 for l in leads if l.status == "qualified")
    duplicates = sum(1 for l in leads if l.duplicate_of_id)
    delivered = sum(1 for d in deliveries if d.status == "delivered")
    failed = sum(1 for d in deliveries if d.status in {"failed", "dead_letter"})
    denom = delivered + failed
    durations = [int(a.duration_ms) for a in attempts if a.duration_ms is not None]
    volume_map: dict[str, int] = {}
    for lead in leads:
        day = (iso(lead.created_at) or "")[:10]
        volume_map[day] = volume_map.get(day, 0) + 1
    volume = []
    now = utc_now()
    for i in range(13, -1, -1):
        d = (now - timedelta(days=i)).date().isoformat()
        volume.append({"day": d, "count": volume_map.get(d, 0)})
    sources: dict[str, int] = {}
    for lead in leads:
        key = lead.source or "unknown"
        sources[key] = sources.get(key, 0) + 1
    listed = await list_leads_sql(session, user_id, {"page": 1, "page_size": 8, "sort": "created_at", "dir": "desc"})
    failed_rows = []
    integrations = {
        i.id: i for i in (await session.scalars(select(Integration).where(Integration.user_id == user_id))).all()
    }
    lead_map = {item.id: item for item in leads}
    for delivery in sorted(deliveries, key=lambda x: x.updated_at, reverse=True):
        if delivery.status in {"failed", "dead_letter", "retry_scheduled"}:
            dest = integrations.get(delivery.integration_id)
            matched_lead = lead_map.get(delivery.lead_id)
            failed_rows.append(
                {
                    "id": delivery.id,
                    "public_id": delivery.public_id,
                    "lead_public_id": matched_lead.public_id if matched_lead else "",
                    "provider": dest.name if dest else "",
                    "status": delivery.status,
                    "error_message": delivery.error_message,
                    "attempt_count": delivery.attempt_count,
                    "created_at": iso(delivery.created_at),
                }
            )
        if len(failed_rows) >= 6:
            break
    return {
        "metrics": {
            "total_leads": total,
            "qualified_leads": qualified,
            "duplicate_rate": (duplicates / total) * 100 if total else 0,
            "delivery_success_rate": (delivered / denom) * 100 if denom else 0,
            "failed_deliveries": failed,
            "avg_delivery_ms": round(sum(durations) / len(durations)) if durations else 0,
        },
        "volume": volume,
        "sources": [{"source": k, "count": v} for k, v in sorted(sources.items(), key=lambda kv: -kv[1])],
        "delivery_breakdown": {
            "delivered": delivered,
            "queued": sum(1 for d in deliveries if d.status == "queued"),
            "processing": sum(1 for d in deliveries if d.status == "processing"),
            "failed": failed,
            "retry_scheduled": sum(1 for d in deliveries if d.status == "retry_scheduled"),
            "dead_letter": sum(1 for d in deliveries if d.status == "dead_letter"),
        },
        "recent_leads": listed["items"],
        "recent_failures": failed_rows,
    }
