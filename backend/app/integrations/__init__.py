"""Sandbox CRM adapters. Nothing here talks to a live CRM."""

from app.integrations.base import CRMAdapter, display_name, get_adapter, map_payload

__all__ = ["CRMAdapter", "display_name", "get_adapter", "map_payload"]
