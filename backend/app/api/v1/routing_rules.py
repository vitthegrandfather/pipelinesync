"""Routing rule CRUD and simulator."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends

from app.api.dependencies import get_workspace
from app.core.errors import AppError
from app.core.ids import new_id
from app.core.time import utc_now
from app.schemas.lead import RoutingRuleIn, SimulateRoutingIn
from app.services.memory import MemoryWorkspace, serialize_rule
from app.services.normalization import normalize_lead
from app.services.routing import route_lead

router = APIRouter(prefix="/routing-rules", tags=["routing"])


@router.get("")
async def list_rules(ws: Annotated[MemoryWorkspace, Depends(get_workspace)]) -> dict[str, Any]:
    rules = sorted(ws.rules, key=lambda r: r["priority"])
    return {"items": [serialize_rule(ws, r) for r in rules]}


@router.post("")
async def create_rule(
    body: RoutingRuleIn,
    ws: Annotated[MemoryWorkspace, Depends(get_workspace)],
) -> dict[str, Any]:
    dest = ws.integration_by_id(body.integration_id)
    if dest is None:
        raise AppError("invalid_integration", "Unknown destination integration.", 422)
    now = utc_now()
    rule = {
        "id": new_id("rule"),
        "public_id": ws.next_public("rule"),
        "name": body.name,
        "priority": body.priority,
        "enabled": body.enabled,
        "field": body.field,
        "operator": body.operator,
        "comparison_value": body.comparison_value,
        "integration_id": body.integration_id,
        "stop_processing": body.stop_processing,
        "created_at": now,
        "updated_at": now,
    }
    ws.rules.append(rule)
    return serialize_rule(ws, rule)


@router.patch("/{rule_id}")
async def patch_rule(
    rule_id: str,
    body: dict[str, Any],
    ws: Annotated[MemoryWorkspace, Depends(get_workspace)],
) -> dict[str, Any]:
    rule = next((r for r in ws.rules if r["id"] == rule_id or r["public_id"] == rule_id), None)
    if rule is None:
        raise AppError("not_found", "Routing rule not found.", 404)
    for key in (
        "name",
        "priority",
        "enabled",
        "field",
        "operator",
        "comparison_value",
        "integration_id",
        "stop_processing",
    ):
        if key in body:
            rule[key] = body[key]
    rule["updated_at"] = utc_now()
    return serialize_rule(ws, rule)


@router.delete("/{rule_id}")
async def delete_rule(
    rule_id: str,
    ws: Annotated[MemoryWorkspace, Depends(get_workspace)],
) -> dict[str, Any]:
    rule = next((r for r in ws.rules if r["id"] == rule_id or r["public_id"] == rule_id), None)
    if rule is None:
        raise AppError("not_found", "Routing rule not found.", 404)
    ws.rules.remove(rule)
    return {"ok": True}


@router.post("/simulate")
async def simulate(
    body: SimulateRoutingIn,
    ws: Annotated[MemoryWorkspace, Depends(get_workspace)],
) -> dict[str, Any]:
    if body.lead_id:
        lead = ws.lead_by_id(body.lead_id)
        if lead is None:
            raise AppError("not_found", "Lead not found.", 404)
        payload = lead
    else:
        payload = normalize_lead(body.model_dump())
    return route_lead(payload, ws.rules_with_destinations(), ws.fallback())
