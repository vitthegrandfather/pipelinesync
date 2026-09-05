"""Public lead intake webhook."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, Request, Response

from app.api.dependencies import require_api_key, use_memory
from app.core.config import settings
from app.db.session import get_session_factory
from app.schemas.lead import IntakePublicResponse, LeadIntakeInput
from app.services.memory import MemoryWorkspace
from app.services.sql_workspace import ingest_sql

router = APIRouter(tags=["intake"])


@router.post("/intake/leads", response_model=IntakePublicResponse, status_code=201)
async def intake_leads(
    body: LeadIntakeInput,
    request: Request,
    response: Response,
    ws: Annotated[MemoryWorkspace, Depends(require_api_key)],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> dict[str, Any]:
    payload = body.model_dump()
    simulate = bool(payload.pop("simulate_failure", False))
    key = idempotency_key or payload.pop("idempotency_key", None)
    if use_memory():
        result, status = await ws.ingest(
            payload,
            idempotency_key=key,
            simulate_failure=simulate,
            process_now=True,
        )
    else:
        factory = get_session_factory()
        user_id = str(getattr(request.state, "api_user_id", None) or ws.user["id"])
        async with factory() as session:
            result, status = await ingest_sql(
                session,
                user_id,
                payload,
                idempotency_key=key,
                simulate_failure=simulate,
                process_now=settings.environment != "production",
            )
            await session.commit()
    response.status_code = status
    return {
        "lead_id": result["lead_id"],
        "status": "accepted",
        "duplicate": result["duplicate"],
        "assigned_destination": result["assigned_destination"],
        "delivery_status": result["delivery_status"],
    }
