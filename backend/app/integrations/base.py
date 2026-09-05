"""CRMAdapter protocol, payload mappers, and adapter factory.

Every destination is a sandbox. This backend never claims a live CRM connection.
"""

from __future__ import annotations

from typing import Any, Protocol

from app.core.ids import public_id_number


class CRMResult(dict):
    """Typed dict-like result from a sandbox adapter."""


class IntegrationHealth(dict):
    pass


class CRMAdapter(Protocol):
    provider: str

    async def create_or_update_contact(self, lead: dict[str, Any]) -> dict[str, Any]: ...

    async def create_deal(self, lead: dict[str, Any], contact: dict[str, Any]) -> dict[str, Any]: ...

    async def health_check(self) -> dict[str, Any]: ...


def hubspot_payload(lead: dict[str, Any]) -> dict[str, Any]:
    return {
        "properties": {
            "email": lead.get("normalized_email"),
            "firstname": lead.get("first_name"),
            "lastname": lead.get("last_name"),
            "phone": lead.get("normalized_phone"),
            "company": lead.get("company"),
            "jobtitle": lead.get("job_title"),
            "country": lead.get("country"),
            "hs_lead_status": "NEW",
        }
    }


def pipedrive_payload(lead: dict[str, Any]) -> dict[str, Any]:
    name = " ".join(p for p in [lead.get("first_name"), lead.get("last_name")] if p) or lead.get("company")
    return {
        "name": name,
        "email": lead.get("normalized_email"),
        "phone": lead.get("normalized_phone"),
        "org_name": lead.get("company"),
    }


def zoho_payload(lead: dict[str, Any]) -> dict[str, Any]:
    return {
        "data": [
            {
                "Email": lead.get("normalized_email"),
                "First_Name": lead.get("first_name"),
                "Last_Name": lead.get("last_name"),
                "Phone": lead.get("normalized_phone"),
                "Company": lead.get("company"),
                "Title": lead.get("job_title"),
                "Country": lead.get("country"),
            }
        ]
    }


def webhook_payload(lead: dict[str, Any]) -> dict[str, Any]:
    return {
        "event": "lead.accepted",
        "lead_id": lead.get("public_id"),
        "contact": {
            "email": lead.get("normalized_email"),
            "phone": lead.get("normalized_phone"),
            "name": " ".join(p for p in [lead.get("first_name"), lead.get("last_name")] if p),
            "company": lead.get("company"),
        },
    }


def map_payload(provider: str, lead: dict[str, Any]) -> dict[str, Any]:
    if provider == "hubspot":
        return hubspot_payload(lead)
    if provider == "pipedrive":
        return pipedrive_payload(lead)
    if provider == "zoho":
        return zoho_payload(lead)
    return webhook_payload(lead)


def contact_ids(provider: str, n: int) -> dict[str, str]:
    if provider == "hubspot":
        return {"contact": f"hubspot-demo-contact-{n}", "deal": f"hubspot-demo-deal-{n}"}
    if provider == "pipedrive":
        return {"contact": f"pipedrive-demo-person-{n}", "deal": f"pipedrive-demo-deal-{n}"}
    if provider == "zoho":
        return {"contact": f"zoho-demo-lead-{n}", "deal": f"zoho-demo-deal-{n}"}
    return {"contact": f"webhook-demo-record-{n}", "deal": f"webhook-demo-event-{n}"}


def display_name(provider: str) -> str:
    if provider == "hubspot":
        return "HubSpot Sandbox"
    if provider == "pipedrive":
        return "Pipedrive Sandbox"
    if provider == "zoho":
        return "Zoho CRM Sandbox"
    return "Default CRM Sandbox"


def get_adapter(provider: str, fail: bool = False) -> CRMAdapter:
    from app.integrations.hubspot import HubSpotSandboxAdapter
    from app.integrations.pipedrive import PipedriveSandboxAdapter
    from app.integrations.sandbox import SandboxAdapter
    from app.integrations.zoho import ZohoSandboxAdapter

    if provider == "hubspot":
        return HubSpotSandboxAdapter(fail=fail)
    if provider == "pipedrive":
        return PipedriveSandboxAdapter(fail=fail)
    if provider == "zoho":
        return ZohoSandboxAdapter(fail=fail)
    return SandboxAdapter(provider="webhook", fail=fail)


def lead_number(lead: dict[str, Any]) -> int:
    return public_id_number(str(lead.get("public_id") or "LD-000000"))
