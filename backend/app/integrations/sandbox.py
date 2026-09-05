"""Generic sandbox adapter used by the default webhook destination."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.integrations.base import contact_ids, display_name, lead_number, map_payload


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class SandboxAdapter:
    """Deterministic sandbox CRM. Labelled Demo everywhere. Never live."""

    def __init__(self, provider: str = "webhook", fail: bool = False) -> None:
        self.provider = provider
        self.fail = fail

    async def create_or_update_contact(self, lead: dict[str, Any]) -> dict[str, Any]:
        n = lead_number(lead)
        if self.fail:
            return {
                "ok": False,
                "provider": self.provider,
                "payload": {"sandbox": True, "simulated_failure": True},
                "error_code": "sandbox_provider_unavailable",
                "error_message": (
                    f"{display_name(self.provider)} sandbox rejected the request (simulated provider failure)."
                ),
                "duration_ms": 42,
            }
        ids = contact_ids(self.provider, n)
        return {
            "ok": True,
            "provider": self.provider,
            "contact_id": ids["contact"],
            "payload": {
                "sandbox": True,
                "mode": "demo",
                "mapped": map_payload(self.provider, lead),
                "contact_id": ids["contact"],
            },
            "duration_ms": 180 + (n % 40),
        }

    async def create_deal(self, lead: dict[str, Any], contact: dict[str, Any]) -> dict[str, Any]:
        n = lead_number(lead)
        if self.fail or not contact.get("ok"):
            return {
                "ok": False,
                "provider": self.provider,
                "payload": {"sandbox": True},
                "error_code": "sandbox_deal_failed",
                "error_message": "Deal was not created because the contact upsert failed.",
                "duration_ms": 18,
            }
        ids = contact_ids(self.provider, n)
        return {
            "ok": True,
            "provider": self.provider,
            "contact_id": contact.get("contact_id"),
            "deal_id": ids["deal"],
            "payload": {
                "sandbox": True,
                "deal_id": ids["deal"],
                "amount": lead.get("budget"),
                "currency": lead.get("currency"),
            },
            "duration_ms": 120 + (n % 30),
        }

    async def health_check(self) -> dict[str, Any]:
        return {
            "status": "healthy",
            "provider": self.provider,
            "mode": "sandbox",
            "latency_ms": 18 + (len(self.provider) % 7),
            "message": (f"{display_name(self.provider)} sandbox is reachable. No live credentials are in use."),
            "checked_at": _utc_now(),
        }
