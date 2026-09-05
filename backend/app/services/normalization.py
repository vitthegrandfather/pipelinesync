"""Lead validation and normalization. Mirrors src/lib/pipeline/normalize.ts."""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any

import phonenumbers

SUPPORTED_COUNTRIES = {
    "US",
    "GB",
    "DE",
    "FR",
    "CA",
    "AU",
    "NL",
    "IE",
    "ES",
    "IT",
    "SE",
    "NO",
    "DK",
    "PL",
    "UA",
    "IN",
    "SG",
    "AE",
    "JP",
    "PT",
    "CH",
    "AT",
    "BE",
    "FI",
    "CZ",
    "RO",
    "ZA",
    "NZ",
    "MX",
}

EMAIL_RE = re.compile(
    r"^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
    r"(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$"
)


class IntakeValidationError(Exception):
    def __init__(self, code: str, message: str, http_status: int = 422) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.http_status = http_status


def _blank(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _clip(value: str | None, max_len: int) -> str | None:
    if value is None:
        return None
    return value[:max_len]


def to_e164(phone: str, country: str | None) -> str:
    region = country if country in SUPPORTED_COUNTRIES else None
    try:
        parsed = phonenumbers.parse(phone, region)
    except phonenumbers.NumberParseException as exc:
        raise IntakeValidationError("invalid_phone", "Phone number is not a valid E.164 number.") from exc
    if not phonenumbers.is_possible_number(parsed):
        raise IntakeValidationError("invalid_phone", "Phone number is not a valid E.164 number.")
    return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)


def payload_hash(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, default=str, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def normalize_lead(payload: dict[str, Any]) -> dict[str, Any]:
    email = _blank(payload.get("email"))
    if email:
        email = email.lower()
        if not EMAIL_RE.match(email):
            raise IntakeValidationError("invalid_email", "Email address is not valid.")

    country = _blank(payload.get("country"))
    if country:
        country = country.upper()
        if country not in SUPPORTED_COUNTRIES:
            raise IntakeValidationError("unsupported_country", f'Country code "{country}" is not supported.')

    phone_raw = _blank(payload.get("phone"))
    phone = to_e164(phone_raw, country) if phone_raw else None
    if not email and not phone:
        raise IntakeValidationError("missing_contact", "A lead must include a valid email or phone number.")

    budget = payload.get("budget")
    budget_n: float | None
    if budget is None or str(budget).strip() == "":
        budget_n = None
    else:
        try:
            budget_n = float(budget)
        except (TypeError, ValueError) as exc:
            raise IntakeValidationError("invalid_budget", "Budget must be a non-negative number.") from exc
        if budget_n < 0:
            raise IntakeValidationError("invalid_budget", "Budget must be a non-negative number.")

    return {
        "first_name": _clip(_blank(payload.get("first_name")), 80),
        "last_name": _clip(_blank(payload.get("last_name")), 80),
        "email": email,
        "normalized_email": email,
        "phone": phone,
        "normalized_phone": phone,
        "company": _clip(_blank(payload.get("company")), 160),
        "job_title": _clip(_blank(payload.get("job_title")), 120),
        "country": country,
        "service": _clip(_blank(payload.get("service")), 120),
        "budget": budget_n,
        "currency": _clip((_blank(payload.get("currency")) or ("USD" if budget_n is not None else None)), 3),
        "message": _clip(_blank(payload.get("message")), 4000),
        "source": _clip(_blank(payload.get("source")), 80),
        "utm_source": _clip(_blank(payload.get("utm_source")), 120),
        "utm_medium": _clip(_blank(payload.get("utm_medium")), 120),
        "utm_campaign": _clip(_blank(payload.get("utm_campaign")), 120),
        "external_id": _clip(_blank(payload.get("external_id")), 120),
        "metadata": payload.get("metadata") if isinstance(payload.get("metadata"), dict) else None,
    }
