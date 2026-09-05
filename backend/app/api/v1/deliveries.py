"""Delivery list, detail, and manual retry."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import get_workspace
from app.core.errors import AppError
from app.services.memory import MemoryWorkspace, serialize_delivery

router = APIRouter(prefix="/deliveries", tags=["deliveries"])


@router.get("")
async def list_deliveries(
    ws: Annotated[MemoryWorkspace, Depends(get_workspace)],
    status: str = "",
    provider: str = "",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> dict[str, Any]:
    items = [serialize_delivery(ws, d) for d in ws.deliveries]
    if status:
        items = [row for row in items if row["status"] == status]
    if provider:
        items = [row for row in items if row["provider_key"] == provider or row["provider"] == provider]
    items.sort(key=lambda r: r["created_at"] or "", reverse=True)
    total = len(items)
    start = (page - 1) * page_size
    return {"items": items[start : start + page_size], "total": total, "page": page, "page_size": page_size}


@router.get("/{delivery_id}")
async def get_delivery(
    delivery_id: str,
    ws: Annotated[MemoryWorkspace, Depends(get_workspace)],
) -> dict[str, Any]:
    delivery = ws.delivery_by_id(delivery_id)
    if delivery is None:
        raise AppError("not_found", "Delivery not found.", 404)
    return serialize_delivery(ws, delivery)


@router.post("/{delivery_id}/retry")
async def retry_delivery(
    delivery_id: str,
    ws: Annotated[MemoryWorkspace, Depends(get_workspace)],
) -> dict[str, Any]:
    return await ws.retry_delivery(delivery_id, force_success=True)
