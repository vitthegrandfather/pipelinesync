"""CSV helpers with formula-injection protection."""

from __future__ import annotations

from typing import Any


def sanitize_csv_cell(value: Any) -> str:
    if value is None:
        return ""
    text = str(value)
    if text[:1] in {"=", "+", "-", "@", "\t", "\r"}:
        text = "'" + text
    if any(ch in text for ch in '",\n\r'):
        return '"' + text.replace('"', '""') + '"'
    return text


def to_csv(headers: list[str], rows: list[list[Any]]) -> str:
    lines = [",".join(sanitize_csv_cell(h) for h in headers)]
    for row in rows:
        lines.append(",".join(sanitize_csv_cell(cell) for cell in row))
    return "\n".join(lines) + "\n"
