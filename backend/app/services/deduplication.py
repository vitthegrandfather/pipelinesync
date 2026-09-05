"""Duplicate detection. Never deletes; stores duplicate_of_id instead."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class DuplicateCandidate:
    id: str
    normalized_email: str | None = None
    normalized_phone: str | None = None
    source: str | None = None
    external_id: str | None = None


@dataclass(frozen=True)
class DuplicateMatch:
    lead_id: str
    reason: str


def find_duplicate(
    *,
    normalized_email: str | None,
    normalized_phone: str | None,
    source: str | None,
    external_id: str | None,
    candidates: Sequence[DuplicateCandidate],
) -> DuplicateMatch | None:
    """Match in TS order: exact email, then exact phone, then source+external_id.

    ``candidates`` must already be ordered by created_at ascending so the oldest
    original lead is returned.
    """
    if normalized_email:
        for row in candidates:
            if row.normalized_email == normalized_email:
                return DuplicateMatch(lead_id=row.id, reason="normalized_email")
    if normalized_phone:
        for row in candidates:
            if row.normalized_phone == normalized_phone:
                return DuplicateMatch(lead_id=row.id, reason="normalized_phone")
    if external_id and source:
        for row in candidates:
            if row.source == source and row.external_id == external_id:
                return DuplicateMatch(lead_id=row.id, reason="external_id")
    return None


def resolve_idempotency(
    existing_hash: str | None,
    existing_response: dict | None,
    incoming_hash: str,
) -> dict | None:
    """Return the stored response on replay, or None to proceed.

    Raises ValueError with code duplicate_idempotency_key when the key was used
    with a different payload.
    """
    if existing_hash is None:
        return None
    if existing_hash != incoming_hash:
        raise ValueError("duplicate_idempotency_key")
    return existing_response
