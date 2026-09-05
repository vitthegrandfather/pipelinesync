"""SQLAlchemy workspace used when PostgreSQL is available (Docker)."""

from __future__ import annotations

from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ids import counter_start, format_public_id, new_id
from app.core.security import hash_api_key, hash_password
from app.core.time import days_ago, utc_now
from app.db.models.delivery import Delivery, DeliveryAttempt
from app.db.models.integration import Integration
from app.db.models.lead import AuditEvent, IdempotencyRecord, Lead
from app.db.models.routing import RoutingDecision, RoutingRule
from app.db.models.user import ApiKey, IdCounter, User, Workspace
from app.integrations.base import display_name
from app.services.deduplication import DuplicateCandidate, find_duplicate
from app.services.delivery import process_delivery
from app.services.normalization import normalize_lead, payload_hash
from app.services.routing import route_lead
from app.services.seed_data import SEED_INTEGRATIONS, SEED_LEADS, SEED_RULES

DEMO_API_KEY = "demo-api-key"


async def next_public(session: AsyncSession, user_id: str, kind: str, year: int | None = None) -> str:
    year = year or utc_now().year
    row = await session.get(IdCounter, (user_id, kind))
    if row is None:
        row = IdCounter(user_id=user_id, kind=kind, value=0)
        session.add(row)
        await session.flush()
    row.value = int(row.value) + 1
    await session.flush()
    return format_public_id(kind, counter_start(kind) + row.value, year)


async def ensure_demo_user(session: AsyncSession, *, email: str, password: str, name: str) -> User:
    user = await session.scalar(select(User).where(User.email == email))
    if user:
        return user
    user = User(
        id=new_id("usr"),
        email=email,
        name=name,
        hashed_password=hash_password(password),
        role="admin",
        active=True,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    session.add(user)
    await session.flush()
    return user


async def seed_user_workspace(session: AsyncSession, user: User) -> None:
    now = utc_now()
    session.add(Workspace(user_id=user.id, seeded_at=now, created_at=now))
    session.add(
        ApiKey(
            id=new_id("key"),
            user_id=user.id,
            name="Website forms",
            key_hash=hash_api_key(DEMO_API_KEY),
            key_prefix="ps_demo_",
            key_last4="4f82",
            active=True,
            created_at=now,
        )
    )
    provider_ids: dict[str, str] = {}
    for spec in SEED_INTEGRATIONS:
        row = Integration(
            id=new_id("int"),
            user_id=user.id,
            public_id=spec["public_id"],
            provider=spec["provider"],
            name=spec["name"],
            mode="sandbox",
            enabled=True,
            config={"sandbox": True},
            health_status="healthy",
            last_checked_at=now,
            last_success_at=now,
            success_count=spec["success"],
            failure_count=spec["fail"],
            created_at=now,
            updated_at=now,
        )
        session.add(row)
        provider_ids[spec["provider"]] = row.id
    await session.flush()
    for spec in SEED_RULES:
        session.add(
            RoutingRule(
                id=new_id("rule"),
                user_id=user.id,
                public_id=await next_public(session, user.id, "rule"),
                name=spec["name"],
                priority=spec["priority"],
                enabled=True,
                field=spec["field"],
                operator=spec["operator"],
                comparison_value=spec["comparison_value"],
                integration_id=provider_ids[spec["provider"]],
                stop_processing=spec["stop_processing"],
                created_at=now,
                updated_at=now,
            )
        )
    await session.flush()
    created_ids: list[str] = []
    rules_rows = (await session.scalars(select(RoutingRule).where(RoutingRule.user_id == user.id))).all()
    integrations = (await session.scalars(select(Integration).where(Integration.user_id == user.id))).all()
    int_map = {i.id: i for i in integrations}
    rule_dicts = [
        {
            "id": r.id,
            "public_id": r.public_id,
            "name": r.name,
            "priority": r.priority,
            "enabled": r.enabled,
            "field": r.field,
            "operator": r.operator,
            "comparison_value": r.comparison_value,
            "integration_id": r.integration_id,
            "integration_name": int_map[r.integration_id].name,
            "provider": int_map[r.integration_id].provider,
            "stop_processing": r.stop_processing,
        }
        for r in rules_rows
    ]
    fallback_row = next(i for i in integrations if i.provider == "webhook")
    fallback = {"id": fallback_row.id, "name": fallback_row.name, "provider": fallback_row.provider}

    for spec in SEED_LEADS:
        created = days_ago(int(spec["days_ago"]), int(spec["hours"]))
        normalized = normalize_lead(spec)
        status = (
            "duplicate"
            if spec.get("duplicate_of") is not None
            else ("qualified" if (normalized.get("budget") or 0) >= 5000 else "accepted")
        )
        lead_id = new_id("lead")
        public_id = await next_public(session, user.id, "lead")
        duplicate_of = created_ids[int(spec["duplicate_of"])] if spec.get("duplicate_of") is not None else None
        session.add(
            Lead(
                id=lead_id,
                user_id=user.id,
                public_id=public_id,
                first_name=normalized.get("first_name"),
                last_name=normalized.get("last_name"),
                email=normalized.get("email"),
                normalized_email=normalized.get("normalized_email"),
                phone=normalized.get("phone"),
                normalized_phone=normalized.get("normalized_phone"),
                company=normalized.get("company"),
                job_title=normalized.get("job_title"),
                country=normalized.get("country"),
                service=normalized.get("service"),
                budget=normalized.get("budget"),
                currency=normalized.get("currency"),
                message=normalized.get("message"),
                source=normalized.get("source"),
                external_id=normalized.get("external_id"),
                utm_source=normalized.get("utm_source"),
                utm_medium=normalized.get("utm_medium"),
                utm_campaign=normalized.get("utm_campaign"),
                metadata_json=normalized.get("metadata"),
                original_payload={
                    k: spec[k]
                    for k in spec
                    if k not in {"days_ago", "hours", "delivery", "force_fail", "duplicate_of", "duplicate_reason"}
                },
                status=status,
                duplicate_of_id=duplicate_of,
                duplicate_reason=spec.get("duplicate_reason"),
                duplicate_detected_at=created if duplicate_of else None,
                created_at=created,
                updated_at=created,
            )
        )
        created_ids.append(lead_id)
        decision = route_lead(normalized, rule_dicts, fallback)
        session.add(
            RoutingDecision(
                id=new_id("rd"),
                user_id=user.id,
                lead_id=lead_id,
                matched_rule_id=decision["matched_rule_id"],
                integration_id=decision["integration_id"],
                reason=decision["reason"],
                evaluation_log=decision["evaluation_log"],
                created_at=created,
            )
        )
        delivery_id = new_id("dlv")
        public_dlv = await next_public(session, user.id, "delivery")
        force_fail = bool(spec.get("force_fail"))
        delivery_status = spec["delivery"]
        n = int(public_id.rsplit("-", 1)[-1])
        dest_name = display_name(decision["provider"])
        contact_id = deal_id = None
        error_code = error_message = None
        attempt_count = 0
        status_final = "queued"
        if delivery_status != "queued":
            attempt_count = 1
            if force_fail:
                status_final = "failed"
                error_code = "sandbox_provider_unavailable"
                error_message = f"{dest_name} sandbox rejected the request (simulated provider failure)."
            else:
                status_final = "delivered"
                prefix = {
                    "hubspot": ("hubspot-demo-contact", "hubspot-demo-deal"),
                    "pipedrive": ("pipedrive-demo-person", "pipedrive-demo-deal"),
                    "zoho": ("zoho-demo-lead", "zoho-demo-deal"),
                }.get(decision["provider"], ("webhook-demo-record", "webhook-demo-event"))
                contact_id = f"{prefix[0]}-{n}"
                deal_id = f"{prefix[1]}-{n}"
        session.add(
            Delivery(
                id=delivery_id,
                user_id=user.id,
                public_id=public_dlv,
                lead_id=lead_id,
                integration_id=decision["integration_id"],
                status=status_final,
                attempt_count=attempt_count,
                provider_contact_id=contact_id,
                provider_deal_id=deal_id,
                error_code=error_code,
                error_message=error_message,
                force_fail=force_fail,
                created_at=created,
                updated_at=created,
            )
        )
        if attempt_count:
            session.add(
                DeliveryAttempt(
                    id=new_id("att"),
                    user_id=user.id,
                    delivery_id=delivery_id,
                    attempt_number=1,
                    status="failed" if force_fail else "delivered",
                    request_payload={"sandbox": True},
                    response_payload={"sandbox": True, "simulated_failure": force_fail},
                    error_message=error_message,
                    duration_ms=42 if force_fail else 180 + (n % 40),
                    created_at=created,
                )
            )
        session.add(
            AuditEvent(
                id=new_id("aud"),
                user_id=user.id,
                actor_type="system",
                actor_id="seed",
                entity_type="lead",
                entity_id=lead_id,
                event_type="lead.accepted",
                event_data={"public_id": public_id, "duplicate": bool(duplicate_of)},
                created_at=created,
            )
        )
    await session.flush()


async def reset_workspace(session: AsyncSession, user_id: str) -> None:
    for model in (
        DeliveryAttempt,
        Delivery,
        RoutingDecision,
        AuditEvent,
        IdempotencyRecord,
        Lead,
        RoutingRule,
        Integration,
        ApiKey,
        IdCounter,
        Workspace,
    ):
        await session.execute(delete(model).where(model.user_id == user_id))
    user = await session.get(User, user_id)
    if user:
        await seed_user_workspace(session, user)


async def load_rules(session: AsyncSession, user_id: str) -> tuple[list[dict[str, Any]], dict[str, str]]:
    rules = (
        await session.scalars(select(RoutingRule).where(RoutingRule.user_id == user_id).order_by(RoutingRule.priority))
    ).all()
    integrations = (await session.scalars(select(Integration).where(Integration.user_id == user_id))).all()
    int_map = {i.id: i for i in integrations}
    fallback = next((i for i in integrations if i.provider == "webhook"), integrations[-1])
    rule_dicts = [
        {
            "id": r.id,
            "public_id": r.public_id,
            "name": r.name,
            "priority": r.priority,
            "enabled": r.enabled,
            "field": r.field,
            "operator": r.operator,
            "comparison_value": r.comparison_value,
            "integration_id": r.integration_id,
            "integration_name": int_map[r.integration_id].name,
            "provider": int_map[r.integration_id].provider,
            "stop_processing": r.stop_processing,
        }
        for r in rules
    ]
    return rule_dicts, {"id": fallback.id, "name": fallback.name, "provider": fallback.provider}


async def ingest_sql(
    session: AsyncSession,
    user_id: str,
    payload: dict[str, Any],
    *,
    idempotency_key: str | None,
    simulate_failure: bool,
    process_now: bool = True,
) -> tuple[dict[str, Any], int]:
    from app.core.errors import AppError
    from app.core.time import iso as to_iso
    from app.services.memory import _step

    hashed = payload_hash(
        {k: v for k, v in payload.items() if k not in {"simulate_failure", "process_now", "idempotency_key"}}
    )
    if idempotency_key:
        existing = await session.scalar(
            select(IdempotencyRecord).where(
                IdempotencyRecord.user_id == user_id, IdempotencyRecord.key == idempotency_key
            )
        )
        if existing:
            if existing.payload_hash != hashed:
                raise AppError(
                    "duplicate_idempotency_key",
                    "This idempotency key was used with a different payload.",
                    409,
                )
            replay = dict(existing.response)
            replay["replayed"] = True
            return replay, 200

    steps = [_step("received", "Payload received", "ok", "Intake endpoint accepted the request.")]
    normalized = normalize_lead(payload)
    steps.append(_step("validated", "Input validated", "ok", "Required contact fields and types passed validation."))
    steps.append(
        _step(
            "normalized",
            "Contact data normalized",
            "ok",
            f"Email {normalized.get('normalized_email') or '—'} · Phone {normalized.get('normalized_phone') or '—'} · Country {normalized.get('country') or '—'}.",
        )
    )
    leads = (await session.scalars(select(Lead).where(Lead.user_id == user_id).order_by(Lead.created_at.asc()))).all()
    match = find_duplicate(
        normalized_email=normalized.get("normalized_email"),
        normalized_phone=normalized.get("normalized_phone"),
        source=normalized.get("source"),
        external_id=normalized.get("external_id"),
        candidates=[
            DuplicateCandidate(
                id=row.id,
                normalized_email=row.normalized_email,
                normalized_phone=row.normalized_phone,
                source=row.source,
                external_id=row.external_id,
            )
            for row in leads
        ],
    )
    duplicate_of = match.lead_id if match else None
    duplicate_reason = match.reason if match else None
    steps.append(
        _step(
            "deduped",
            "Duplicate rules evaluated",
            "warn" if duplicate_of else "ok",
            f"Matched existing lead by {duplicate_reason.replace('normalized_', '')}."
            if duplicate_of and duplicate_reason
            else "No email, phone, or source+external ID match.",
        )
    )
    rule_dicts, fallback = await load_rules(session, user_id)
    decision = route_lead(normalized, rule_dicts, fallback)
    steps.append(_step("routed", "Routing rule matched", "ok", f"{decision['integration_name']}. {decision['reason']}"))
    status = "duplicate" if duplicate_of else ("qualified" if (normalized.get("budget") or 0) >= 5000 else "accepted")
    now = utc_now()
    lead_id = new_id("lead")
    public_id = await next_public(session, user_id, "lead", now.year)
    session.add(
        Lead(
            id=lead_id,
            user_id=user_id,
            public_id=public_id,
            first_name=normalized.get("first_name"),
            last_name=normalized.get("last_name"),
            email=normalized.get("email"),
            normalized_email=normalized.get("normalized_email"),
            phone=normalized.get("phone"),
            normalized_phone=normalized.get("normalized_phone"),
            company=normalized.get("company"),
            job_title=normalized.get("job_title"),
            country=normalized.get("country"),
            service=normalized.get("service"),
            budget=normalized.get("budget"),
            currency=normalized.get("currency"),
            message=normalized.get("message"),
            source=normalized.get("source"),
            external_id=normalized.get("external_id"),
            utm_source=normalized.get("utm_source"),
            utm_medium=normalized.get("utm_medium"),
            utm_campaign=normalized.get("utm_campaign"),
            metadata_json=normalized.get("metadata"),
            original_payload=payload,
            status=status,
            duplicate_of_id=duplicate_of,
            duplicate_reason=duplicate_reason,
            duplicate_detected_at=now if duplicate_of else None,
            idempotency_key=idempotency_key,
            idempotency_payload_hash=hashed if idempotency_key else None,
            created_at=now,
            updated_at=now,
        )
    )
    session.add(
        RoutingDecision(
            id=new_id("rd"),
            user_id=user_id,
            lead_id=lead_id,
            matched_rule_id=decision["matched_rule_id"],
            integration_id=decision["integration_id"],
            reason=decision["reason"],
            evaluation_log=decision["evaluation_log"],
            created_at=now,
        )
    )
    delivery_id = new_id("dlv")
    delivery_public = await next_public(session, user_id, "delivery", now.year)
    session.add(
        Delivery(
            id=delivery_id,
            user_id=user_id,
            public_id=delivery_public,
            lead_id=lead_id,
            integration_id=decision["integration_id"],
            status="queued",
            attempt_count=0,
            force_fail=bool(simulate_failure),
            created_at=now,
            updated_at=now,
        )
    )
    session.add(
        AuditEvent(
            id=new_id("aud"),
            user_id=user_id,
            actor_type="api",
            actor_id="intake",
            entity_type="lead",
            entity_id=lead_id,
            event_type="lead.accepted",
            event_data={"public_id": public_id, "duplicate": bool(duplicate_of)},
            created_at=now,
        )
    )
    await session.flush()
    steps.append(
        _step("queued", "Delivery queued", "ok", f"Job {delivery_public} created for {decision['integration_name']}.")
    )
    delivery_status = "queued"
    if process_now:
        processed = await process_delivery(session, user_id, delivery_id, simulate_now=True, force_success=False)
        delivery_status = processed["status"]
        if processed["status"] == "delivered":
            steps.append(
                _step(
                    "delivered",
                    "Sandbox CRM accepted the lead",
                    "ok",
                    f"{decision['integration_name']} (sandbox) stored the contact.",
                )
            )
        else:
            steps.append(
                _step(
                    "delivered",
                    "Sandbox CRM rejected the lead",
                    "error",
                    processed.get("error") or "Provider returned a sandbox failure.",
                )
            )
    else:
        from app.workers.tasks import enqueue_delivery

        enqueue_delivery(delivery_id, user_id, countdown=0)

    result = {
        "lead_id": public_id,
        "lead_internal_id": lead_id,
        "status": status,
        "duplicate": bool(duplicate_of),
        "duplicate_of_id": duplicate_of,
        "duplicate_reason": duplicate_reason,
        "assigned_destination": decision["integration_name"],
        "delivery_status": delivery_status,
        "delivery_id": delivery_public,
        "steps": steps,
        "replayed": False,
    }
    if idempotency_key:
        session.add(
            IdempotencyRecord(
                id=new_id("idem"),
                user_id=user_id,
                key=idempotency_key,
                payload_hash=hashed,
                lead_id=lead_id,
                response=result,
                created_at=now,
            )
        )
    _ = to_iso
    return result, 201
