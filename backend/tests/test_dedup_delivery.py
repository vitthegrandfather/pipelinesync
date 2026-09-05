"""Deduplication, routing, sandbox delivery, retries, and CSV formula protection."""

from __future__ import annotations

import pytest

from app.services.deduplication import DuplicateCandidate, find_duplicate
from app.services.delivery import MAX_ATTEMPTS, next_retry_at, outcome_status, process_delivery_memory
from app.services.memory import MemoryWorkspace
from app.services.normalization import normalize_lead, to_e164
from app.services.routing import route_lead


def _ws() -> MemoryWorkspace:
    ws = MemoryWorkspace("usr_test", email="admin@pipelinesync.demo", name="Demo", password="demo12345")
    ws.seed()
    return ws


def test_phone_normalization_e164() -> None:
    assert to_e164("+44 20 7946 0958", "GB") == "+442079460958"
    lead = normalize_lead({"email": "oliver.grant@example.com", "phone": "0161 496 0288", "country": "GB"})
    assert lead["normalized_phone"] == "+441614960288"


def test_phone_deduplication() -> None:
    ws = _ws()
    oliver = next(l for l in ws.leads if l["email"] == "oliver.grant@example.com")
    match = find_duplicate(
        normalized_email="different@example.com",
        normalized_phone=oliver["normalized_phone"],
        source="partner",
        external_id="OTHER",
        candidates=[
            DuplicateCandidate(
                id=row["id"],
                normalized_email=row.get("normalized_email"),
                normalized_phone=row.get("normalized_phone"),
                source=row.get("source"),
                external_id=row.get("external_id"),
            )
            for row in ws.leads
        ],
    )
    assert match is not None
    assert match.reason == "normalized_phone"
    assert match.lead_id == oliver["id"]


def test_external_id_deduplication() -> None:
    ws = _ws()
    maya = next(l for l in ws.leads if l["external_id"] == "FORM-10482")
    match = find_duplicate(
        normalized_email="unique.external@example.com",
        normalized_phone="+15555550123",
        source="website",
        external_id="FORM-10482",
        candidates=[
            DuplicateCandidate(
                id=row["id"],
                normalized_email=row.get("normalized_email"),
                normalized_phone=row.get("normalized_phone"),
                source=row.get("source"),
                external_id=row.get("external_id"),
            )
            for row in ws.leads
        ],
    )
    assert match is not None
    assert match.reason == "external_id"
    assert match.lead_id == maya["id"]


def test_routing_priority_and_default() -> None:
    ws = _ws()
    rules = ws.rules_with_destinations()
    fallback = ws.fallback()
    enterprise = route_lead(
        {"budget": 8500, "country": "GB", "service": "CRM integration", "email": "a@b.c"}, rules, fallback
    )
    assert enterprise["provider"] == "hubspot"
    uk = route_lead({"budget": 2400, "country": "GB", "service": "Website forms", "email": "a@b.c"}, rules, fallback)
    assert uk["provider"] == "pipedrive"
    automation = route_lead(
        {"budget": 1000, "country": "IN", "service": "Business automation", "email": "a@b.c"},
        rules,
        fallback,
    )
    assert automation["provider"] == "zoho"
    other = route_lead({"budget": 100, "country": "US", "service": "Other", "email": "a@b.c"}, rules, fallback)
    assert other["provider"] == "webhook"


def test_disabled_routing_rules() -> None:
    ws = _ws()
    for rule in ws.rules:
        rule["enabled"] = False
    result = route_lead(
        {"budget": 99999, "country": "GB", "email": "a@b.c"}, ws.rules_with_destinations(), ws.fallback()
    )
    assert result["provider"] == "webhook"
    assert result["matched_rule_id"] is None


@pytest.mark.asyncio
async def test_sandbox_crm_delivery_success() -> None:
    delivery = {
        "status": "queued",
        "attempt_count": 0,
        "force_fail": False,
        "attempts": [],
    }
    result = await process_delivery_memory(
        delivery,
        {
            "public_id": "LD-2026-001042",
            "first_name": "Maya",
            "email": "maya.chen@example.com",
            "normalized_email": "maya.chen@example.com",
            "budget": 8500,
            "currency": "USD",
        },
        "hubspot",
        simulate_now=True,
    )
    assert result["status"] == "delivered"
    assert delivery["provider_contact_id"] == "hubspot-demo-contact-1042"
    assert delivery["provider_deal_id"] == "hubspot-demo-deal-1042"


@pytest.mark.asyncio
async def test_failed_delivery_and_retry_schedule() -> None:
    delivery = {
        "status": "queued",
        "attempt_count": 0,
        "force_fail": True,
        "attempts": [],
    }
    lead = {"public_id": "LD-2026-001099", "email": "fail@example.com", "normalized_email": "fail@example.com"}
    first = await process_delivery_memory(delivery, lead, "webhook", simulate_now=False, force_success=False)
    assert first["status"] == "retry_scheduled"
    assert delivery["attempt_count"] == 1
    assert next_retry_at(1) is not None
    second = await process_delivery_memory(delivery, lead, "webhook", simulate_now=False, force_success=False)
    assert second["status"] == "retry_scheduled"
    third = await process_delivery_memory(delivery, lead, "webhook", simulate_now=False, force_success=False)
    assert third["status"] == "dead_letter"
    assert delivery["attempt_count"] == MAX_ATTEMPTS


def test_max_retry_outcome() -> None:
    assert outcome_status(3, success=False, simulate_now=False) == "dead_letter"
    assert outcome_status(1, success=False, simulate_now=True) == "failed"
    assert outcome_status(1, success=True, simulate_now=True) == "delivered"


@pytest.mark.asyncio
async def test_manual_retry_succeeds(client, auth_headers) -> None:
    listed = client.get("/api/v1/deliveries?status=failed", headers=auth_headers)
    assert listed.status_code == 200
    items = listed.json()["items"]
    assert len(items) >= 2
    delivery_id = items[0]["id"]
    retried = client.post(f"/api/v1/deliveries/{delivery_id}/retry", headers=auth_headers)
    assert retried.status_code == 200, retried.text
    assert retried.json()["status"] == "delivered"
