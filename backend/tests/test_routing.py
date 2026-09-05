from app.services.normalization import normalize_lead
from app.services.routing import evaluate_operator, route_lead

FALLBACK = {"id": "def", "name": "Default CRM Sandbox", "provider": "webhook"}
RULES = [
    {
        "id": "1",
        "public_id": "RULE-011",
        "name": "Enterprise",
        "priority": 10,
        "enabled": True,
        "field": "budget",
        "operator": "greater_than",
        "comparison_value": "4999.99",
        "integration_id": "hs",
        "integration_name": "HubSpot Sandbox",
        "provider": "hubspot",
        "stop_processing": True,
    },
    {
        "id": "2",
        "public_id": "RULE-012",
        "name": "UK",
        "priority": 20,
        "enabled": True,
        "field": "country",
        "operator": "equals",
        "comparison_value": "GB",
        "integration_id": "pd",
        "integration_name": "Pipedrive Sandbox",
        "provider": "pipedrive",
        "stop_processing": True,
    },
]


def test_priority_budget_over_country() -> None:
    lead = normalize_lead({"email": "maya.chen@example.com", "country": "GB", "budget": 8500})
    result = route_lead(lead, RULES, FALLBACK)
    assert result["integration_name"] == "HubSpot Sandbox"


def test_uk_without_enterprise_budget() -> None:
    lead = normalize_lead({"email": "oliver.grant@example.com", "country": "GB", "budget": 2400})
    result = route_lead(lead, RULES, FALLBACK)
    assert result["integration_name"] == "Pipedrive Sandbox"


def test_disabled_rules_use_default() -> None:
    rules = [{**RULES[1], "enabled": False}]
    lead = normalize_lead({"email": "oliver.grant@example.com", "country": "GB", "budget": 1000})
    result = route_lead(lead, rules, FALLBACK)
    assert result["integration_name"] == "Default CRM Sandbox"


def test_contains_automation() -> None:
    assert evaluate_operator("Business automation", "contains", "automation") is True
    assert evaluate_operator("CRM integration", "contains", "automation") is False
