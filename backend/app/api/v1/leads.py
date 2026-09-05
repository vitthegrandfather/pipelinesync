"""Lead list, detail, audit, patch, and CSV export."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import PlainTextResponse

from app.api.dependencies import get_workspace, use_memory
from app.core.errors import AppError
from app.core.ids import new_id
from app.core.time import iso, utc_now
from app.schemas.lead import LeadFilter
from app.services.csv_export import to_csv
from app.services.memory import (
    MemoryWorkspace,
    filter_leads,
    serialize_lead,
    serialize_list_lead,
)

router = APIRouter(prefix="/leads", tags=["leads"])


def _filters(
    q: str = "",
    status: str = "",
    duplicate: str = "all",
    source: str = "",
    service: str = "",
    country: str = "",
    destination: str = "",
    delivery_status: str = "",
    sort: str = "created_at",
    dir: str = "desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=100),
) -> dict[str, Any]:
    return {
        "q": q,
        "status": status,
        "duplicate": duplicate,
        "source": source,
        "service": service,
        "country": country,
        "destination": destination,
        "delivery_status": delivery_status,
        "sort": sort,
        "dir": dir,
        "page": page,
        "page_size": page_size,
    }


@router.get("")
async def list_leads(
    ws: Annotated[MemoryWorkspace, Depends(get_workspace)],
    params: Annotated[dict[str, Any], Depends(_filters)],
) -> dict[str, Any]:
    items, total = filter_leads(ws, params)
    all_rows = [serialize_list_lead(ws, lead) for lead in ws.leads]
    return {
        "items": items,
        "total": total,
        "page": params["page"],
        "page_size": params["page_size"],
        "facets": {
            "source": sorted({r["source"] for r in all_rows if r["source"]}),
            "service": sorted({r["service"] for r in all_rows if r["service"]}),
            "country": sorted({r["country"] for r in all_rows if r["country"]}),
            "destination": sorted({r["destination"] for r in all_rows if r["destination"]}),
        },
    }


@router.get("/export.csv")
async def export_csv(
    ws: Annotated[MemoryWorkspace, Depends(get_workspace)],
    params: Annotated[dict[str, Any], Depends(_filters)],
) -> Response:
    params = {**params, "page": 1, "page_size": 10000}
    items, _ = filter_leads(ws, params)
    headers = [
        "public_id",
        "first_name",
        "last_name",
        "email",
        "company",
        "service",
        "source",
        "status",
        "destination",
        "delivery_status",
        "duplicate",
        "created_at",
    ]
    rows = [
        [
            r["public_id"],
            r["first_name"],
            r["last_name"],
            r.get("email"),
            r["company"],
            r["service"],
            r["source"],
            r["status"],
            r["destination"],
            r["delivery_status"],
            "yes" if r["duplicate"] else "no",
            r["created_at"],
        ]
        for r in items
    ]
    body = to_csv(headers, rows)
    return PlainTextResponse(body, media_type="text/csv; charset=utf-8")


@router.get("/{lead_id}")
async def get_lead(
    lead_id: str,
    ws: Annotated[MemoryWorkspace, Depends(get_workspace)],
) -> dict[str, Any]:
    lead = ws.lead_by_id(lead_id)
    if lead is None:
        raise AppError("not_found", "Lead not found.", 404)
    return serialize_lead(ws, lead)


@router.patch("/{lead_id}")
async def patch_lead(
    lead_id: str,
    body: dict[str, Any],
    ws: Annotated[MemoryWorkspace, Depends(get_workspace)],
) -> dict[str, Any]:
    lead = ws.lead_by_id(lead_id)
    if lead is None:
        raise AppError("not_found", "Lead not found.", 404)
    allowed = {"status", "job_title", "company", "service", "message"}
    for key, value in body.items():
        if key in allowed:
            lead[key] = value
    lead["updated_at"] = utc_now()
    ws.audits.append(
        {
            "id": new_id("aud"),
            "actor_type": "user",
            "actor_id": ws.user["id"],
            "entity_type": "lead",
            "entity_id": lead["id"],
            "event_type": "lead.updated",
            "event_data": {k: body[k] for k in body if k in allowed},
            "created_at": utc_now(),
        }
    )
    return serialize_lead(ws, lead)


@router.get("/{lead_id}/audit")
async def lead_audit(
    lead_id: str,
    ws: Annotated[MemoryWorkspace, Depends(get_workspace)],
) -> dict[str, Any]:
    lead = ws.lead_by_id(lead_id)
    if lead is None:
        raise AppError("not_found", "Lead not found.", 404)
    events = [
        {
            **event,
            "created_at": iso(event["created_at"]),
        }
        for event in ws.audits
        if event["entity_id"] in {lead["id"], *(d["id"] for d in ws.deliveries if d["lead_id"] == lead["id"])}
    ]
    events.sort(key=lambda e: e["created_at"])
    return {"items": events}


_ = (LeadFilter, use_memory)
