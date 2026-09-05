"""Lead persistence helpers. Filtering and serialization stay out of route handlers."""

from __future__ import annotations

from typing import Any

from app.services.memory import MemoryWorkspace, filter_leads, serialize_lead


def get_lead(workspace: MemoryWorkspace, lead_id: str) -> dict[str, Any] | None:
    lead = workspace.lead_by_id(lead_id)
    if lead is None:
        return None
    return serialize_lead(workspace, lead)


def search_leads(workspace: MemoryWorkspace, params: dict[str, Any]) -> tuple[list[dict[str, Any]], int]:
    return filter_leads(workspace, params)
