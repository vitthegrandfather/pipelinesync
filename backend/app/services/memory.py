"""In-memory workspace used by pytest and as the FastAPI test double.

Production Docker uses SQLAlchemy (see ``app.services.sql_workspace``). The
domain rules live in the service modules; this store only persists them.
"""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime
from typing import Any

from app.core.ids import counter_start, format_public_id, new_id
from app.core.security import hash_api_key, hash_password
from app.core.time import days_ago, iso, utc_now
from app.integrations.base import display_name, get_adapter
from app.services.deduplication import DuplicateCandidate, find_duplicate
from app.services.delivery import process_delivery_memory
from app.services.normalization import normalize_lead, payload_hash
from app.services.routing import route_lead
from app.services.seed_data import SEED_INTEGRATIONS, SEED_LEADS, SEED_RULES

DEMO_API_KEY = "demo-api-key"


def _step(step_id: str, label: str, status: str, detail: str | None = None) -> dict[str, Any]:
    return {
        "id": step_id,
        "label": label,
        "status": status,
        "timestamp": iso(utc_now()),
        "detail": detail,
    }


class MemoryWorkspace:
    def __init__(self, user_id: str, *, email: str, name: str, password: str) -> None:
        now = utc_now()
        self.user = {
            "id": user_id,
            "email": email,
            "name": name,
            "hashed_password": hash_password(password),
            "role": "admin",
            "active": True,
            "created_at": now,
        }
        self.leads: list[dict[str, Any]] = []
        self.integrations: list[dict[str, Any]] = []
        self.rules: list[dict[str, Any]] = []
        self.decisions: list[dict[str, Any]] = []
        self.deliveries: list[dict[str, Any]] = []
        self.attempts: list[dict[str, Any]] = []
        self.audits: list[dict[str, Any]] = []
        self.idempotency: dict[str, dict[str, Any]] = {}
        self.counters: dict[str, int] = {"lead": 0, "delivery": 0, "rule": 0}
        self.api_keys: list[dict[str, Any]] = []
        self.seeded_at: datetime | None = None

    def next_public(self, kind: str, year: int = 2026) -> str:
        self.counters[kind] = self.counters.get(kind, 0) + 1
        return format_public_id(kind, counter_start(kind) + self.counters[kind], year)

    def integration_by_provider(self, provider: str) -> dict[str, Any]:
        for row in self.integrations:
            if row["provider"] == provider:
                return row
        return self.integrations[-1]

    def integration_by_id(self, integration_id: str) -> dict[str, Any] | None:
        for row in self.integrations:
            if row["id"] == integration_id:
                return row
        return None

    def lead_by_id(self, lead_id: str) -> dict[str, Any] | None:
        for row in self.leads:
            if row["id"] == lead_id or row["public_id"] == lead_id:
                return row
        return None

    def delivery_by_id(self, delivery_id: str) -> dict[str, Any] | None:
        for row in self.deliveries:
            if row["id"] == delivery_id or row["public_id"] == delivery_id:
                return row
        return None

    def rules_with_destinations(self) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for rule in self.rules:
            dest = self.integration_by_id(rule["integration_id"])
            out.append(
                {
                    **rule,
                    "integration_name": dest["name"] if dest else "Unknown",
                    "provider": dest["provider"] if dest else "webhook",
                }
            )
        return out

    def fallback(self) -> dict[str, str]:
        dest = self.integration_by_provider("webhook")
        return {"id": dest["id"], "name": dest["name"], "provider": dest["provider"]}

    def seed(self) -> None:
        self.leads.clear()
        self.integrations.clear()
        self.rules.clear()
        self.decisions.clear()
        self.deliveries.clear()
        self.attempts.clear()
        self.audits.clear()
        self.idempotency.clear()
        self.counters = {"lead": 0, "delivery": 0, "rule": 0}
        self.api_keys.clear()
        now = utc_now()
        self.seeded_at = now

        self.api_keys.append(
            {
                "id": new_id("key"),
                "name": "Website forms",
                "key_hash": hash_api_key(DEMO_API_KEY),
                "key_prefix": "ps_demo_",
                "key_last4": "4f82",
                "active": True,
                "last_used_at": None,
                "created_at": now,
                "raw": DEMO_API_KEY,
            }
        )

        provider_ids: dict[str, str] = {}
        for spec in SEED_INTEGRATIONS:
            row = {
                "id": new_id("int"),
                "public_id": spec["public_id"],
                "provider": spec["provider"],
                "name": spec["name"],
                "mode": "sandbox",
                "enabled": True,
                "config": {"sandbox": True},
                "health_status": "healthy",
                "last_checked_at": now,
                "last_success_at": now,
                "success_count": spec["success"],
                "failure_count": spec["fail"],
                "created_at": now,
                "updated_at": now,
            }
            self.integrations.append(row)
            provider_ids[spec["provider"]] = row["id"]

        for spec in SEED_RULES:
            created = now
            self.rules.append(
                {
                    "id": new_id("rule"),
                    "public_id": self.next_public("rule"),
                    "name": spec["name"],
                    "priority": spec["priority"],
                    "enabled": True,
                    "field": spec["field"],
                    "operator": spec["operator"],
                    "comparison_value": spec["comparison_value"],
                    "integration_id": provider_ids[spec["provider"]],
                    "stop_processing": spec["stop_processing"],
                    "created_at": created,
                    "updated_at": created,
                }
            )

        created_leads: list[dict[str, Any]] = []
        for spec in SEED_LEADS:
            created = days_ago(int(spec["days_ago"]), int(spec["hours"]))
            normalized = normalize_lead(spec)
            status = (
                "duplicate"
                if spec.get("duplicate_of") is not None
                else ("qualified" if (normalized.get("budget") or 0) >= 5000 else "accepted")
            )
            lead_id = new_id("lead")
            public_id = self.next_public("lead")
            duplicate_of = None
            if spec.get("duplicate_of") is not None:
                duplicate_of = created_leads[int(spec["duplicate_of"])]["id"]
            lead = {
                "id": lead_id,
                "public_id": public_id,
                **normalized,
                "original_payload": {
                    k: spec[k]
                    for k in spec
                    if k
                    not in {
                        "days_ago",
                        "hours",
                        "delivery",
                        "force_fail",
                        "duplicate_of",
                        "duplicate_reason",
                    }
                },
                "status": status,
                "duplicate_of_id": duplicate_of,
                "duplicate_reason": spec.get("duplicate_reason"),
                "duplicate_detected_at": created if duplicate_of else None,
                "created_at": created,
                "updated_at": created,
            }
            self.leads.append(lead)
            created_leads.append(lead)

            rules = self.rules_with_destinations()
            decision = route_lead(normalized, rules, self.fallback())
            self.decisions.append(
                {
                    "id": new_id("rd"),
                    "lead_id": lead_id,
                    "matched_rule_id": decision["matched_rule_id"],
                    "integration_id": decision["integration_id"],
                    "reason": decision["reason"],
                    "evaluation_log": decision["evaluation_log"],
                    "created_at": created,
                }
            )
            delivery_id = new_id("dlv")
            delivery_public = self.next_public("delivery")
            delivery_status = spec["delivery"]
            force_fail = bool(spec.get("force_fail"))
            delivery: dict[str, Any] = {
                "id": delivery_id,
                "public_id": delivery_public,
                "lead_id": lead_id,
                "integration_id": decision["integration_id"],
                "status": "queued",
                "attempt_count": 0,
                "provider_contact_id": None,
                "provider_deal_id": None,
                "request_payload": None,
                "response_payload": None,
                "error_code": None,
                "error_message": None,
                "next_retry_at": None,
                "force_fail": force_fail,
                "attempts": [],
                "created_at": created,
                "updated_at": created,
            }
            self.deliveries.append(delivery)
            if delivery_status != "queued":
                n = int(public_id.rsplit("-", 1)[-1])
                dest = display_name(decision["provider"])
                if force_fail:
                    delivery["status"] = "failed"
                    delivery["attempt_count"] = 1
                    delivery["error_code"] = "sandbox_provider_unavailable"
                    delivery["error_message"] = f"{dest} sandbox rejected the request (simulated provider failure)."
                    delivery["attempts"] = [
                        {
                            "id": new_id("att"),
                            "attempt_number": 1,
                            "status": "failed",
                            "error_message": delivery["error_message"],
                            "duration_ms": 42,
                            "created_at": iso(created),
                            "request_payload": {"sandbox": True},
                            "response_payload": {"sandbox": True, "simulated_failure": True},
                        }
                    ]
                else:
                    prefix = {
                        "hubspot": ("hubspot-demo-contact", "hubspot-demo-deal"),
                        "pipedrive": ("pipedrive-demo-person", "pipedrive-demo-deal"),
                        "zoho": ("zoho-demo-lead", "zoho-demo-deal"),
                    }.get(decision["provider"], ("webhook-demo-record", "webhook-demo-event"))
                    delivery["status"] = "delivered"
                    delivery["attempt_count"] = 1
                    delivery["provider_contact_id"] = f"{prefix[0]}-{n}"
                    delivery["provider_deal_id"] = f"{prefix[1]}-{n}"
                    delivery["attempts"] = [
                        {
                            "id": new_id("att"),
                            "attempt_number": 1,
                            "status": "delivered",
                            "error_message": None,
                            "duration_ms": 180 + (n % 40),
                            "created_at": iso(created),
                            "request_payload": {"sandbox": True},
                            "response_payload": {
                                "contact": {"contact_id": delivery["provider_contact_id"]},
                                "deal": {"deal_id": delivery["provider_deal_id"]},
                            },
                        }
                    ]
                self.attempts.extend([{**a, "delivery_id": delivery_id} for a in delivery["attempts"]])
            self.audits.append(
                {
                    "id": new_id("aud"),
                    "actor_type": "system",
                    "actor_id": "seed",
                    "entity_type": "lead",
                    "entity_id": lead_id,
                    "event_type": "lead.accepted",
                    "event_data": {"public_id": public_id, "duplicate": bool(duplicate_of)},
                    "created_at": created,
                }
            )

    async def ingest(
        self,
        payload: dict[str, Any],
        *,
        idempotency_key: str | None,
        simulate_failure: bool,
        process_now: bool = True,
        actor: dict[str, str] | None = None,
    ) -> tuple[dict[str, Any], int]:
        steps = [_step("received", "Payload received", "ok", "Intake endpoint accepted the request.")]
        hashed = payload_hash(
            {k: v for k, v in payload.items() if k not in {"simulate_failure", "process_now", "idempotency_key"}}
        )
        if idempotency_key:
            existing = self.idempotency.get(idempotency_key)
            if existing:
                if existing["payload_hash"] != hashed:
                    from app.core.errors import AppError

                    raise AppError(
                        "duplicate_idempotency_key",
                        "This idempotency key was used with a different payload.",
                        409,
                    )
                replay = deepcopy(existing["response"])
                replay["replayed"] = True
                return replay, 200

        normalized = normalize_lead(payload)
        steps.append(
            _step("validated", "Input validated", "ok", "Required contact fields and types passed validation.")
        )
        steps.append(
            _step(
                "normalized",
                "Contact data normalized",
                "ok",
                f"Email {normalized.get('normalized_email') or '—'} · Phone {normalized.get('normalized_phone') or '—'} · Country {normalized.get('country') or '—'}.",
            )
        )

        candidates = [
            DuplicateCandidate(
                id=row["id"],
                normalized_email=row.get("normalized_email"),
                normalized_phone=row.get("normalized_phone"),
                source=row.get("source"),
                external_id=row.get("external_id"),
            )
            for row in sorted(self.leads, key=lambda r: r["created_at"])
        ]
        match = find_duplicate(
            normalized_email=normalized.get("normalized_email"),
            normalized_phone=normalized.get("normalized_phone"),
            source=normalized.get("source"),
            external_id=normalized.get("external_id"),
            candidates=candidates,
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

        decision = route_lead(normalized, self.rules_with_destinations(), self.fallback())
        steps.append(
            _step("routed", "Routing rule matched", "ok", f"{decision['integration_name']}. {decision['reason']}")
        )

        status = (
            "duplicate" if duplicate_of else ("qualified" if (normalized.get("budget") or 0) >= 5000 else "accepted")
        )
        now = utc_now()
        lead_id = new_id("lead")
        public_id = self.next_public("lead", now.year)
        lead = {
            "id": lead_id,
            "public_id": public_id,
            **normalized,
            "original_payload": payload,
            "status": status,
            "duplicate_of_id": duplicate_of,
            "duplicate_reason": duplicate_reason,
            "duplicate_detected_at": now if duplicate_of else None,
            "created_at": now,
            "updated_at": now,
        }
        self.leads.append(lead)
        self.decisions.append(
            {
                "id": new_id("rd"),
                "lead_id": lead_id,
                "matched_rule_id": decision["matched_rule_id"],
                "integration_id": decision["integration_id"],
                "reason": decision["reason"],
                "evaluation_log": decision["evaluation_log"],
                "created_at": now,
            }
        )
        delivery_id = new_id("dlv")
        delivery_public = self.next_public("delivery", now.year)
        delivery: dict[str, Any] = {
            "id": delivery_id,
            "public_id": delivery_public,
            "lead_id": lead_id,
            "integration_id": decision["integration_id"],
            "status": "queued",
            "attempt_count": 0,
            "provider_contact_id": None,
            "provider_deal_id": None,
            "request_payload": None,
            "response_payload": None,
            "error_code": None,
            "error_message": None,
            "next_retry_at": None,
            "force_fail": bool(simulate_failure),
            "attempts": [],
            "created_at": now,
            "updated_at": now,
        }
        self.deliveries.append(delivery)
        actor = actor or {"type": "api", "id": "intake"}
        self.audits.append(
            {
                "id": new_id("aud"),
                "actor_type": actor["type"],
                "actor_id": actor["id"],
                "entity_type": "lead",
                "entity_id": lead_id,
                "event_type": "lead.accepted",
                "event_data": {"public_id": public_id, "duplicate": bool(duplicate_of)},
                "created_at": now,
            }
        )
        self.audits.append(
            {
                "id": new_id("aud"),
                "actor_type": "system",
                "actor_id": "router",
                "entity_type": "lead",
                "entity_id": lead_id,
                "event_type": "lead.routed",
                "event_data": {"destination": decision["integration_name"], "reason": decision["reason"]},
                "created_at": now,
            }
        )
        steps.append(
            _step(
                "queued", "Delivery queued", "ok", f"Job {delivery_public} created for {decision['integration_name']}."
            )
        )

        delivery_status = "queued"
        if process_now:
            processed = await process_delivery_memory(
                delivery,
                {**normalized, "public_id": public_id},
                decision["provider"],
                simulate_now=True,
                force_success=False,
            )
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
            for attempt in delivery.get("attempts") or []:
                self.attempts.append({**attempt, "delivery_id": delivery_id, "id": attempt.get("id") or new_id("att")})

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
            self.idempotency[idempotency_key] = {
                "payload_hash": hashed,
                "lead_id": lead_id,
                "response": deepcopy(result),
            }
        return result, 201

    async def retry_delivery(self, delivery_id: str, *, force_success: bool = True) -> dict[str, Any]:
        delivery = self.delivery_by_id(delivery_id)
        if delivery is None:
            from app.core.errors import AppError

            raise AppError("not_found", "Delivery not found.", 404)
        if delivery["status"] not in {"failed", "dead_letter", "retry_scheduled", "queued"}:
            from app.core.errors import AppError

            raise AppError("invalid_state", "Delivery cannot be retried in its current state.", 409)
        lead = self.lead_by_id(delivery["lead_id"])
        dest = self.integration_by_id(delivery["integration_id"])
        if lead is None or dest is None:
            from app.core.errors import AppError

            raise AppError("not_found", "Lead or integration missing.", 404)
        dto = {**lead, "public_id": lead["public_id"]}
        processed = await process_delivery_memory(
            delivery, dto, dest["provider"], simulate_now=True, force_success=force_success
        )
        for attempt in delivery.get("attempts") or []:
            if not any(
                a.get("attempt_number") == attempt["attempt_number"] and a.get("delivery_id") == delivery["id"]
                for a in self.attempts
            ):
                self.attempts.append(
                    {**attempt, "delivery_id": delivery["id"], "id": attempt.get("id") or new_id("att")}
                )
        return {"ok": True, "status": processed["status"], "delivery": serialize_delivery(self, delivery)}


class AppMemory:
    """Process-wide in-memory database keyed by user id."""

    def __init__(self) -> None:
        self.workspaces: dict[str, MemoryWorkspace] = {}
        self.users_by_email: dict[str, str] = {}

    def ensure_demo(self, *, email: str, password: str, name: str) -> MemoryWorkspace:
        if email in self.users_by_email:
            return self.workspaces[self.users_by_email[email]]
        user_id = new_id("usr")
        ws = MemoryWorkspace(user_id, email=email, name=name, password=password)
        ws.seed()
        self.workspaces[user_id] = ws
        self.users_by_email[email.lower()] = user_id
        return ws

    def by_api_key(self, raw_key: str) -> MemoryWorkspace | None:
        hashed = hash_api_key(raw_key)
        for ws in self.workspaces.values():
            for key in ws.api_keys:
                if key["active"] and key["key_hash"] == hashed:
                    key["last_used_at"] = utc_now()
                    return ws
        return None

    def by_user_id(self, user_id: str) -> MemoryWorkspace | None:
        return self.workspaces.get(user_id)


def serialize_lead(ws: MemoryWorkspace, lead: dict[str, Any]) -> dict[str, Any]:
    decision = next((d for d in ws.decisions if d["lead_id"] == lead["id"]), None)
    dest = ws.integration_by_id(decision["integration_id"]) if decision else None
    delivery = next((d for d in ws.deliveries if d["lead_id"] == lead["id"]), None)
    original = next((x for x in ws.leads if x["id"] == lead.get("duplicate_of_id")), None)
    return {
        **lead,
        "budget": float(lead["budget"]) if lead.get("budget") is not None else None,
        "created_at": iso(lead["created_at"]),
        "updated_at": iso(lead["updated_at"]),
        "duplicate_detected_at": iso(lead.get("duplicate_detected_at")),
        "duplicate": bool(lead.get("duplicate_of_id")),
        "duplicate_of_public_id": original["public_id"] if original else None,
        "destination": dest["name"] if dest else None,
        "provider": dest["provider"] if dest else None,
        "delivery_status": delivery["status"] if delivery else None,
        "delivery_public_id": delivery["public_id"] if delivery else None,
        "routing": {
            "matched_rule_id": decision.get("matched_rule_id") if decision else None,
            "reason": decision.get("reason") if decision else None,
            "evaluation_log": decision.get("evaluation_log") if decision else [],
            "integration_name": dest["name"] if dest else None,
        }
        if decision
        else None,
        "deliveries": [serialize_delivery(ws, d) for d in ws.deliveries if d["lead_id"] == lead["id"]],
    }


def serialize_list_lead(ws: MemoryWorkspace, lead: dict[str, Any]) -> dict[str, Any]:
    full = serialize_lead(ws, lead)
    return {
        "id": lead["id"],
        "public_id": lead["public_id"],
        "first_name": lead.get("first_name") or "",
        "last_name": lead.get("last_name") or "",
        "company": lead.get("company") or "",
        "service": lead.get("service") or "",
        "source": lead.get("source") or "",
        "status": lead["status"],
        "created_at": full["created_at"],
        "destination": full["destination"] or "",
        "delivery_status": full["delivery_status"] or "",
        "duplicate": full["duplicate"],
        "country": lead.get("country") or "",
        "email": lead.get("email") or "",
    }


def serialize_delivery(ws: MemoryWorkspace, delivery: dict[str, Any]) -> dict[str, Any]:
    lead = ws.lead_by_id(delivery["lead_id"])
    dest = ws.integration_by_id(delivery["integration_id"])
    attempts = delivery.get("attempts") or [a for a in ws.attempts if a.get("delivery_id") == delivery["id"]]
    last = attempts[-1] if attempts else None
    return {
        "id": delivery["id"],
        "public_id": delivery["public_id"],
        "lead_id": delivery["lead_id"],
        "lead_public_id": lead["public_id"] if lead else "",
        "integration_id": delivery["integration_id"],
        "provider": dest["name"] if dest else "",
        "provider_key": dest["provider"] if dest else "",
        "status": delivery["status"],
        "attempt_count": delivery["attempt_count"],
        "provider_contact_id": delivery.get("provider_contact_id"),
        "provider_deal_id": delivery.get("provider_deal_id"),
        "request_payload": delivery.get("request_payload"),
        "response_payload": delivery.get("response_payload"),
        "error_code": delivery.get("error_code"),
        "error_message": delivery.get("error_message"),
        "duration_ms": last.get("duration_ms") if last else None,
        "next_retry_at": delivery.get("next_retry_at")
        if isinstance(delivery.get("next_retry_at"), str)
        else iso(delivery.get("next_retry_at")),
        "created_at": iso(delivery["created_at"])
        if not isinstance(delivery["created_at"], str)
        else delivery["created_at"],
        "attempts": attempts,
        "mode": "sandbox",
    }


def serialize_rule(ws: MemoryWorkspace, rule: dict[str, Any]) -> dict[str, Any]:
    dest = ws.integration_by_id(rule["integration_id"])
    return {
        "id": rule["id"],
        "public_id": rule["public_id"],
        "name": rule["name"],
        "priority": rule["priority"],
        "enabled": rule["enabled"],
        "field": rule["field"],
        "operator": rule["operator"],
        "comparison_value": rule.get("comparison_value") or "",
        "integration_id": rule["integration_id"],
        "destination": dest["name"] if dest else "",
        "provider": dest["provider"] if dest else "webhook",
        "stop_processing": rule["stop_processing"],
        "created_at": iso(rule["created_at"]),
        "updated_at": iso(rule["updated_at"]),
    }


def serialize_integration(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "public_id": row["public_id"],
        "provider": row["provider"],
        "name": row["name"],
        "mode": "sandbox",
        "enabled": row["enabled"],
        "health_status": row["health_status"],
        "last_checked_at": iso(row["last_checked_at"])
        if not isinstance(row.get("last_checked_at"), str)
        else row.get("last_checked_at"),
        "last_success_at": iso(row["last_success_at"])
        if not isinstance(row.get("last_success_at"), str)
        else row.get("last_success_at"),
        "success_count": row["success_count"],
        "failure_count": row["failure_count"],
    }


def filter_leads(ws: MemoryWorkspace, params: dict[str, Any]) -> tuple[list[dict[str, Any]], int]:
    items = [serialize_list_lead(ws, lead) for lead in ws.leads]
    q = (params.get("q") or "").strip().lower()
    if q:
        items = [
            row
            for row in items
            if q
            in " ".join(
                [
                    row["public_id"],
                    row["first_name"],
                    row["last_name"],
                    row["company"],
                    row["email"],
                    row["service"],
                ]
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
    return items[start : start + page_size], total


def dashboard_payload(ws: MemoryWorkspace) -> dict[str, Any]:
    total = len(ws.leads)
    qualified = sum(1 for l in ws.leads if l["status"] == "qualified")
    duplicates = sum(1 for l in ws.leads if l.get("duplicate_of_id"))
    delivered = sum(1 for d in ws.deliveries if d["status"] == "delivered")
    failed = sum(1 for d in ws.deliveries if d["status"] in {"failed", "dead_letter"})
    denom = delivered + failed
    durations = [int(a["duration_ms"]) for a in ws.attempts if a.get("duration_ms") is not None]
    for d in ws.deliveries:
        for a in d.get("attempts") or []:
            if a.get("duration_ms") is not None:
                durations.append(int(a["duration_ms"]))
    volume_map: dict[str, int] = {}
    for lead in ws.leads:
        day = iso(lead["created_at"]) or ""
        day = day[:10]
        volume_map[day] = volume_map.get(day, 0) + 1
    volume: list[dict[str, Any]] = []
    now = utc_now()
    from datetime import timedelta

    for i in range(13, -1, -1):
        day_key = (now - timedelta(days=i)).date().isoformat()
        volume.append({"day": day_key, "count": volume_map.get(day_key, 0)})
    sources: dict[str, int] = {}
    for lead in ws.leads:
        key = lead.get("source") or "unknown"
        sources[key] = sources.get(key, 0) + 1
    recent = sorted(ws.leads, key=lambda l: l["created_at"], reverse=True)[:8]
    failures = [
        serialize_delivery(ws, d)
        for d in sorted(ws.deliveries, key=lambda x: x["updated_at"], reverse=True)
        if d["status"] in {"failed", "dead_letter", "retry_scheduled"}
    ][:6]
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
            "queued": sum(1 for d in ws.deliveries if d["status"] == "queued"),
            "processing": sum(1 for d in ws.deliveries if d["status"] == "processing"),
            "failed": failed,
            "retry_scheduled": sum(1 for d in ws.deliveries if d["status"] == "retry_scheduled"),
            "dead_letter": sum(1 for d in ws.deliveries if d["status"] == "dead_letter"),
        },
        "recent_leads": [serialize_list_lead(ws, l) for l in recent],
        "recent_failures": failures,
    }


async def test_connection(ws: MemoryWorkspace, integration_id: str) -> dict[str, Any]:
    row = ws.integration_by_id(integration_id)
    if row is None:
        from app.core.errors import AppError

        raise AppError("not_found", "Integration not found.", 404)
    adapter = get_adapter(row["provider"], fail=False)
    health = await adapter.health_check()
    row["last_checked_at"] = utc_now()
    row["health_status"] = health["status"]
    return health
