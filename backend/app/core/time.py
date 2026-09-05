"""UTC helpers used across services."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def days_ago(days: int, hours: int) -> datetime:
    d = utc_now() - timedelta(days=days)
    return d.replace(hour=hours % 24, minute=(days * 7) % 60, second=0, microsecond=0)
