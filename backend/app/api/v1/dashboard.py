"""Dashboard summary, volume, and source breakdowns."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends

from app.api.dependencies import get_workspace
from app.services.memory import MemoryWorkspace, dashboard_payload

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
async def summary(ws: Annotated[MemoryWorkspace, Depends(get_workspace)]) -> dict[str, Any]:
    return dashboard_payload(ws)


@router.get("/volume")
async def volume(ws: Annotated[MemoryWorkspace, Depends(get_workspace)]) -> dict[str, Any]:
    return {"items": dashboard_payload(ws)["volume"]}


@router.get("/sources")
async def sources(ws: Annotated[MemoryWorkspace, Depends(get_workspace)]) -> dict[str, Any]:
    return {"items": dashboard_payload(ws)["sources"]}
