"""Demo reset and intake simulator (authenticated)."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, Response

from app.api.dependencies import get_workspace
from app.core.security import mask_api_key
from app.core.time import iso
from app.schemas.lead import LeadIntakeInput
from app.services.memory import MemoryWorkspace

router = APIRouter(tags=["demo"])


@router.post("/demo/reset")
async def reset_demo(ws: Annotated[MemoryWorkspace, Depends(get_workspace)]) -> dict[str, Any]:
    ws.seed()
    return {"ok": True, "leads": len(ws.leads)}


@router.get("/settings")
async def settings_view(ws: Annotated[MemoryWorkspace, Depends(get_workspace)]) -> dict[str, Any]:
    keys = [
        {
            "id": k["id"],
            "name": k["name"],
            "masked": mask_api_key(k["key_prefix"], k["key_last4"]),
            "active": k["active"],
            "last_used_at": iso(k["last_used_at"]),
            "created_at": iso(k["created_at"]),
        }
        for k in ws.api_keys
    ]
    return {
        "api_keys": keys,
        "notice": (
            "Demo environment. All contacts and companies are fictional. "
            "CRM providers use deterministic sandbox adapters. No live credentials are in use."
        ),
    }


@router.post("/intake/simulate")
async def simulate_intake(
    body: LeadIntakeInput,
    request: Request,
    response: Response,
    ws: Annotated[MemoryWorkspace, Depends(get_workspace)],
) -> dict[str, Any]:
    payload = body.model_dump()
    simulate = bool(payload.pop("simulate_failure", False))
    result, status = await ws.ingest(
        payload,
        idempotency_key=payload.pop("idempotency_key", None),
        simulate_failure=simulate,
        process_now=True,
        actor={"type": "user", "id": str(ws.user["id"])},
    )
    response.status_code = status
    return result
