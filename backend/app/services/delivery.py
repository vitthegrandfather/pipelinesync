"""Delivery worker: atomic claim, sandbox adapter call, exponential retry."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ids import new_id
from app.db.models.delivery import Delivery, DeliveryAttempt
from app.db.models.integration import Integration
from app.db.models.lead import AuditEvent, Lead
from app.integrations.base import get_adapter, map_payload

RETRY_DELAYS_MS = [30_000, 120_000, 600_000]
MAX_ATTEMPTS = 3


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def next_retry_at(attempt_count: int, now: datetime | None = None) -> datetime | None:
    """Return the next retry instant after ``attempt_count`` failed attempts.

    Delays: 30s, 2m, 10m. ``attempt_count`` is 1-based (the attempt that just ran).
    """
    if attempt_count < 1 or attempt_count > len(RETRY_DELAYS_MS):
        return None
    delay = RETRY_DELAYS_MS[attempt_count - 1]
    if not delay:
        return None
    base = now or utc_now()
    return base + timedelta(milliseconds=delay)


def outcome_status(attempt_number: int, *, success: bool, simulate_now: bool) -> str:
    if success:
        return "delivered"
    if attempt_number >= MAX_ATTEMPTS:
        return "dead_letter"
    return "failed" if simulate_now else "retry_scheduled"


async def call_adapter(
    lead_dto: dict[str, Any],
    provider: str,
    fail: bool,
) -> tuple[dict[str, Any], dict[str, Any] | None, dict[str, Any]]:
    adapter = get_adapter(provider, fail)
    request_payload = map_payload(provider, lead_dto)
    started = utc_now()
    try:
        contact = await adapter.create_or_update_contact(lead_dto)
        deal: dict[str, Any] | None = None
        if contact.get("ok"):
            deal = await adapter.create_deal(lead_dto, contact)
    except Exception as err:  # noqa: BLE001 - adapter failures become delivery failures
        contact = {
            "ok": False,
            "provider": provider,
            "payload": {},
            "error_code": "adapter_exception",
            "error_message": str(err) or "Unknown adapter error",
            "duration_ms": int((utc_now() - started).total_seconds() * 1000),
        }
        deal = None
    return contact, deal, request_payload


def lead_to_dto(lead: Lead) -> dict[str, Any]:
    budget = lead.budget
    if budget is not None:
        budget = float(budget)
    return {
        "first_name": lead.first_name,
        "last_name": lead.last_name,
        "email": lead.email,
        "normalized_email": lead.normalized_email,
        "phone": lead.phone,
        "normalized_phone": lead.normalized_phone,
        "company": lead.company,
        "job_title": lead.job_title,
        "country": lead.country,
        "service": lead.service,
        "budget": budget,
        "currency": lead.currency,
        "message": lead.message,
        "source": lead.source,
        "utm_source": lead.utm_source,
        "utm_medium": lead.utm_medium,
        "utm_campaign": lead.utm_campaign,
        "external_id": lead.external_id,
        "metadata": lead.metadata_json,
        "public_id": lead.public_id,
    }


async def process_delivery(
    session: AsyncSession,
    user_id: str,
    delivery_id: str,
    *,
    simulate_now: bool = True,
    force_success: bool = False,
) -> dict[str, Any]:
    """Atomically claim a delivery, call the sandbox adapter, persist the outcome."""
    claimed = await session.execute(
        text(
            """
            UPDATE deliveries
            SET status = 'processing', updated_at = now()
            WHERE id = :id AND user_id = :user_id
              AND status IN ('queued', 'failed', 'retry_scheduled', 'dead_letter')
            RETURNING id, lead_id, integration_id, status, attempt_count, force_fail
            """
        ),
        {"id": delivery_id, "user_id": user_id},
    )
    row = claimed.mappings().first()
    if row is None:
        current = await session.get(Delivery, delivery_id)
        return {
            "status": current.status if current else "queued",
            "error": "Delivery is already being processed.",
        }

    integration = await session.scalar(
        select(Integration).where(
            Integration.id == row["integration_id"],
            Integration.user_id == user_id,
        )
    )
    lead = await session.scalar(select(Lead).where(Lead.id == row["lead_id"], Lead.user_id == user_id))
    if lead is None or integration is None:
        return {"status": "failed", "error": "Lead or integration missing."}

    provider = integration.provider
    attempt_number = int(row["attempt_count"]) + 1
    fail = bool(row["force_fail"]) and not force_success
    dto = lead_to_dto(lead)
    contact, deal, request_payload = await call_adapter(dto, provider, fail)
    duration = int(contact.get("duration_ms") or 0) + int((deal or {}).get("duration_ms") or 0)
    ok = bool(contact.get("ok") and deal and deal.get("ok"))

    session.add(
        DeliveryAttempt(
            id=new_id("att"),
            user_id=user_id,
            delivery_id=delivery_id,
            attempt_number=attempt_number,
            status="delivered" if ok else "failed",
            request_payload=request_payload,
            response_payload={"contact": contact.get("payload"), "deal": (deal or {}).get("payload")},
            error_message=None if ok else contact.get("error_message"),
            duration_ms=duration,
            created_at=utc_now(),
        )
    )

    delivery = await session.get(Delivery, delivery_id)
    if delivery is None:
        return {"status": "failed", "error": "Delivery disappeared during processing."}

    if ok:
        delivery.status = "delivered"
        delivery.attempt_count = attempt_number
        delivery.provider_contact_id = contact.get("contact_id")
        delivery.provider_deal_id = (deal or {}).get("deal_id")
        delivery.request_payload = request_payload
        delivery.response_payload = {
            "contact": contact.get("payload"),
            "deal": (deal or {}).get("payload"),
        }
        delivery.error_code = None
        delivery.error_message = None
        delivery.next_retry_at = None
        delivery.force_fail = False
        delivery.updated_at = utc_now()
        integration.success_count = int(integration.success_count) + 1
        integration.last_success_at = utc_now()
        integration.health_status = "healthy"
        integration.updated_at = utc_now()
        session.add(
            AuditEvent(
                id=new_id("aud"),
                user_id=user_id,
                actor_type="system",
                actor_id="worker",
                entity_type="delivery",
                entity_id=delivery_id,
                event_type="delivery.delivered",
                event_data={
                    "attempt": attempt_number,
                    "contact_id": contact.get("contact_id"),
                    "deal_id": (deal or {}).get("deal_id"),
                },
            )
        )
        await session.flush()
        return {"status": "delivered"}

    retry_at = next_retry_at(attempt_number)
    terminal = attempt_number >= MAX_ATTEMPTS
    status = outcome_status(attempt_number, success=False, simulate_now=simulate_now)
    delivery.status = status
    delivery.attempt_count = attempt_number
    delivery.request_payload = request_payload
    delivery.response_payload = contact.get("payload")
    delivery.error_code = contact.get("error_code") or "sandbox_error"
    delivery.error_message = contact.get("error_message") or "Delivery failed"
    delivery.next_retry_at = None if terminal else retry_at
    delivery.updated_at = utc_now()
    integration.failure_count = int(integration.failure_count) + 1
    integration.health_status = "degraded"
    integration.updated_at = utc_now()
    session.add(
        AuditEvent(
            id=new_id("aud"),
            user_id=user_id,
            actor_type="system",
            actor_id="worker",
            entity_type="delivery",
            entity_id=delivery_id,
            event_type="delivery.dead_letter" if terminal else "delivery.failed",
            event_data={
                "attempt": attempt_number,
                "error": contact.get("error_message"),
                "next_status": status,
            },
        )
    )
    await session.flush()

    if status == "retry_scheduled" and retry_at is not None and not simulate_now:
        from app.workers.tasks import enqueue_delivery

        delay = max(0, int((retry_at - utc_now()).total_seconds()))
        enqueue_delivery(delivery_id, user_id, countdown=delay)

    return {"status": status, "error": contact.get("error_message")}


async def process_delivery_memory(
    delivery: dict[str, Any],
    lead_dto: dict[str, Any],
    provider: str,
    *,
    simulate_now: bool = True,
    force_success: bool = False,
) -> dict[str, Any]:
    """In-memory delivery processing used by unit tests and MemoryWorkspace."""
    if delivery.get("status") == "processing":
        return {"status": "processing", "error": "Delivery is already being processed."}

    claimable = {"queued", "failed", "retry_scheduled", "dead_letter"}
    if delivery.get("status") not in claimable:
        return {
            "status": delivery.get("status") or "queued",
            "error": "Delivery is already being processed.",
        }

    delivery["status"] = "processing"
    attempt_number = int(delivery.get("attempt_count") or 0) + 1
    fail = bool(delivery.get("force_fail")) and not force_success
    contact, deal, request_payload = await call_adapter(lead_dto, provider, fail)
    duration = int(contact.get("duration_ms") or 0) + int((deal or {}).get("duration_ms") or 0)
    ok = bool(contact.get("ok") and deal and deal.get("ok"))
    attempt = {
        "attempt_number": attempt_number,
        "status": "delivered" if ok else "failed",
        "request_payload": request_payload,
        "response_payload": {"contact": contact.get("payload"), "deal": (deal or {}).get("payload")},
        "error_message": None if ok else contact.get("error_message"),
        "duration_ms": duration,
        "created_at": iso(utc_now()),
    }
    delivery.setdefault("attempts", []).append(attempt)
    delivery["attempt_count"] = attempt_number
    delivery["request_payload"] = request_payload

    if ok:
        delivery["status"] = "delivered"
        delivery["provider_contact_id"] = contact.get("contact_id")
        delivery["provider_deal_id"] = (deal or {}).get("deal_id")
        delivery["response_payload"] = attempt["response_payload"]
        delivery["error_code"] = None
        delivery["error_message"] = None
        delivery["next_retry_at"] = None
        delivery["force_fail"] = False
        return {"status": "delivered", "delivery": delivery, "contact": contact, "deal": deal}

    retry_at = next_retry_at(attempt_number)
    terminal = attempt_number >= MAX_ATTEMPTS
    status = outcome_status(attempt_number, success=False, simulate_now=simulate_now)
    delivery["status"] = status
    delivery["response_payload"] = contact.get("payload")
    delivery["error_code"] = contact.get("error_code") or "sandbox_error"
    delivery["error_message"] = contact.get("error_message") or "Delivery failed"
    delivery["next_retry_at"] = None if terminal else iso(retry_at)
    return {"status": status, "error": contact.get("error_message"), "delivery": delivery}
