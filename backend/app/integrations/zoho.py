"""Zoho CRM Sandbox adapter. Deterministic demo IDs only."""

from __future__ import annotations

from app.integrations.sandbox import SandboxAdapter


class ZohoSandboxAdapter(SandboxAdapter):
    def __init__(self, fail: bool = False) -> None:
        super().__init__(provider="zoho", fail=fail)
