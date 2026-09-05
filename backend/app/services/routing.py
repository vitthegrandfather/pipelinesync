"""Ordered routing engine. Mirrors src/lib/pipeline/routing.ts."""

from __future__ import annotations

from typing import Any


def evaluate_operator(actual: Any, operator: str, expected: str | None) -> bool:
    empty = actual is None or actual == ""
    if operator == "is_empty":
        return empty
    if operator == "is_not_empty":
        return not empty
    if operator == "equals":
        return not empty and str(actual).lower() == str(expected or "").lower()
    if operator == "does_not_equal":
        return empty or str(actual).lower() != str(expected or "").lower()
    if operator == "contains":
        return not empty and str(expected or "").lower() in str(actual).lower()
    if operator in {"greater_than", "less_than"}:
        try:
            left = float(actual)
            right = float(expected)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return False
        return left > right if operator == "greater_than" else left < right
    return False


def route_lead(
    lead: dict[str, Any],
    rules: list[dict[str, Any]],
    fallback: dict[str, str],
) -> dict[str, Any]:
    log: list[dict[str, Any]] = []
    matched: dict[str, Any] | None = None
    for rule in sorted(rules, key=lambda r: int(r["priority"])):
        if not rule.get("enabled", True):
            log.append(
                {
                    "rule_id": rule["id"],
                    "public_id": rule["public_id"],
                    "name": rule["name"],
                    "priority": rule["priority"],
                    "field": rule["field"],
                    "operator": rule["operator"],
                    "comparison_value": rule.get("comparison_value"),
                    "matched": False,
                    "skipped": True,
                    "skip_reason": "Rule is disabled.",
                    "detail": "Rule is disabled.",
                }
            )
            continue
        actual = lead.get(rule["field"])
        did = evaluate_operator(actual, rule["operator"], rule.get("comparison_value"))
        log.append(
            {
                "rule_id": rule["id"],
                "public_id": rule["public_id"],
                "name": rule["name"],
                "priority": rule["priority"],
                "field": rule["field"],
                "operator": rule["operator"],
                "comparison_value": rule.get("comparison_value"),
                "matched": did,
                "skipped": False,
                "skip_reason": None,
                "detail": f"{rule['field']}={actual}",
            }
        )
        if did:
            matched = rule
            if rule.get("stop_processing", True):
                break
    if not matched:
        return {
            "integration_id": fallback["id"],
            "integration_name": fallback["name"],
            "provider": fallback["provider"],
            "reason": "No enabled routing rule matched. Assigned to the default sandbox destination.",
            "evaluation_log": log,
            "matched_rule_id": None,
            "matched_rule_public_id": None,
            "matched_rule_name": None,
        }
    return {
        "integration_id": matched["integration_id"],
        "integration_name": matched["integration_name"],
        "provider": matched["provider"],
        "reason": (f"Matched rule {matched['public_id']} ({matched['name']}) at priority {matched['priority']}."),
        "evaluation_log": log,
        "matched_rule_id": matched["id"],
        "matched_rule_public_id": matched["public_id"],
        "matched_rule_name": matched["name"],
    }
