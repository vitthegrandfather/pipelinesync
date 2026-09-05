"""Public and internal identifier helpers. Matches the TypeScript domain."""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4()}"


def request_id() -> str:
    return f"req_{uuid.uuid4().hex[:20]}"


def format_public_id(kind: str, n: int, year: int | None = None) -> str:
    year = year if year is not None else datetime.now(timezone.utc).year
    if kind == "lead":
        return f"LD-{year}-{str(n).zfill(6)}"
    if kind == "delivery":
        return f"DLV-{year}-{str(n).zfill(6)}"
    return f"RULE-{str(n).zfill(3)}"


def public_id_number(public_id: str) -> int:
    match = re.search(r"(\d+)$", public_id)
    return int(match.group(1)) if match else 1


def counter_start(kind: str) -> int:
    if kind == "lead":
        return 1000
    if kind == "delivery":
        return 4800
    return 10
