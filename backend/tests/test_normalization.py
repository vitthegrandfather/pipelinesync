from app.services.normalization import IntakeValidationError, normalize_lead, to_e164


def test_email_lowercase_and_trim() -> None:
    lead = normalize_lead(
        {
            "first_name": "  Maya  ",
            "email": "Maya.Chen@Example.com",
            "phone": "+44 20 7946 0958",
            "country": "gb",
        }
    )
    assert lead["email"] == "maya.chen@example.com"
    assert lead["first_name"] == "Maya"
    assert lead["country"] == "GB"


def test_invalid_email() -> None:
    try:
        normalize_lead({"email": "not-an-email", "country": "US"})
        raise AssertionError("expected failure")
    except IntakeValidationError as exc:
        assert exc.code == "invalid_email"


def test_uk_phone_e164() -> None:
    assert to_e164("020 7946 0958", "GB") == "+442079460958"


def test_unsupported_country() -> None:
    try:
        normalize_lead({"email": "a@example.com", "country": "ZZ"})
        raise AssertionError("expected failure")
    except IntakeValidationError as exc:
        assert exc.code == "unsupported_country"


def test_blank_to_null() -> None:
    lead = normalize_lead({"email": "a@example.com", "company": "   ", "country": "US"})
    assert lead["company"] is None
