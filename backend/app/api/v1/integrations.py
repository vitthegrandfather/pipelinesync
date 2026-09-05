"""Sandbox CRM integration cards."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends

from app.api.dependencies import get_workspace
from app.core.errors import AppError
from app.core.time import utc_now
from app.services.memory import MemoryWorkspace, serialize_integration, test_connection

router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.get("")
async def list_integrations(ws: Annotated[MemoryWorkspace, Depends(get_workspace)]) -> dict[str, Any]:
    return {"items": [serialize_integration(row) for row in ws.integrations]}


@router.patch("/{integration_id}")
async def patch_integration(
    integration_id: str,
    body: dict[str, Any],
    ws: Annotated[MemoryWorkspace, Depends(get_workspace)],
) -> dict[str, Any]:
    row = ws.integration_by_id(integration_id)
    if row is None:
        raise AppError("not_found", "Integration not found.", 404)
    if "enabled" in body:
        row["enabled"] = bool(body["enabled"])
    if "name" in body and body["name"]:
        row["name"] = str(body["name"])[:120]
    row["updated_at"] = utc_now()
    return serialize_integration(row)


@router.post("/{integration_id}/test")
async def test_integration(
    integration_id: str,
    ws: Annotated[MemoryWorkspace, Depends(get_workspace)],
) -> dict[str, Any]:
    return await test_connection(ws, integration_id)
