"""Lead intake orchestration. Handlers call this instead of embedding pipeline rules."""

from __future__ import annotations

from typing import Any

from app.services.memory import MemoryWorkspace


async def ingest_lead(
    workspace: MemoryWorkspace,
    payload: dict[str, Any],
    *,
    idempotency_key: str | None = None,
    simulate_failure: bool = False,
    process_now: bool = True,
) -> tuple[dict[str, Any], int]:
    """Validate, normalize, dedupe, route, and queue a lead for sandbox delivery."""
    return await workspace.ingest(
        payload,
        idempotency_key=idempotency_key,
        simulate_failure=simulate_failure,
        process_now=process_now,
    )
