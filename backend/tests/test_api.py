"""HTTP-level coverage for intake, auth, health, reset, and CSV export."""

from __future__ import annotations

from tests.conftest import MAYA


def test_health(client) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["mode"] == "sandbox"
    assert "X-Request-ID" in response.headers


def test_ready(client) -> None:
    response = client.get("/ready")
    assert response.status_code == 200
    assert response.json()["status"] in {"ok", "degraded"}


def test_protected_admin_route_without_token(client) -> None:
    response = client.get("/api/v1/leads")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


def test_login_and_me(client, auth_headers) -> None:
    me = client.get("/api/v1/auth/me", headers=auth_headers)
    assert me.status_code == 200
    assert me.json()["email"] == "admin@pipelinesync.demo"


def test_invalid_api_key(client) -> None:
    response = client.post(
        "/api/v1/intake/leads",
        headers={"X-API-Key": "nope", "Idempotency-Key": "k1"},
        json=MAYA,
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


def test_invalid_email_intake(client) -> None:
    payload = {**MAYA, "email": "not-an-email", "phone": None}
    response = client.post(
        "/api/v1/intake/leads",
        headers={"X-API-Key": "demo-api-key", "Idempotency-Key": "bad-email"},
        json=payload,
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_email"


def test_valid_lead_intake_new_contact(client) -> None:
    payload = {
        **MAYA,
        "email": "jordan.hale@example.com",
        "phone": "+1 415 555 0199",
        "external_id": "FORM-NEW-1",
        "first_name": "Jordan",
        "last_name": "Hale",
        "company": "Cedar & Co",
        "budget": 1200,
        "country": "US",
    }
    response = client.post(
        "/api/v1/intake/leads",
        headers={"X-API-Key": "demo-api-key", "Idempotency-Key": "jordan-1"},
        json=payload,
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["lead_id"].startswith("LD-")
    assert body["duplicate"] is False
    assert body["delivery_status"] in {"delivered", "queued"}
    assert "Sandbox" in body["assigned_destination"]


def test_idempotent_replay(client) -> None:
    payload = {
        **MAYA,
        "email": "replay.case@example.com",
        "phone": "+1 212 555 0100",
        "external_id": "FORM-REPLAY",
        "country": "US",
    }
    headers = {"X-API-Key": "demo-api-key", "Idempotency-Key": "replay-key"}
    first = client.post("/api/v1/intake/leads", headers=headers, json=payload)
    second = client.post("/api/v1/intake/leads", headers=headers, json=payload)
    assert first.status_code == 201
    assert second.status_code == 200
    assert first.json()["lead_id"] == second.json()["lead_id"]


def test_conflicting_idempotency_key(client) -> None:
    headers = {"X-API-Key": "demo-api-key", "Idempotency-Key": "conflict-key"}
    first = client.post(
        "/api/v1/intake/leads",
        headers=headers,
        json={
            **MAYA,
            "email": "conflict.a@example.com",
            "phone": "+1 303 555 0101",
            "country": "US",
            "external_id": "C1",
        },
    )
    second = client.post(
        "/api/v1/intake/leads",
        headers=headers,
        json={
            **MAYA,
            "email": "conflict.b@example.com",
            "phone": "+1 303 555 0102",
            "country": "US",
            "external_id": "C2",
        },
    )
    assert first.status_code == 201
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "duplicate_idempotency_key"


def test_email_deduplication(client) -> None:
    response = client.post(
        "/api/v1/intake/leads",
        headers={"X-API-Key": "demo-api-key", "Idempotency-Key": "maya-dup"},
        json=MAYA,
    )
    assert response.status_code == 201
    assert response.json()["duplicate"] is True


def test_demo_reset_restores_seed(client, auth_headers) -> None:
    before = client.get("/api/v1/dashboard/summary", headers=auth_headers)
    assert before.status_code == 200
    total = before.json()["metrics"]["total_leads"]
    client.post(
        "/api/v1/intake/leads",
        headers={"X-API-Key": "demo-api-key", "Idempotency-Key": "reset-extra"},
        json={
            **MAYA,
            "email": "reset.extra@example.com",
            "phone": "+1 415 555 0111",
            "country": "US",
            "external_id": "RESET-1",
        },
    )
    reset = client.post("/api/v1/demo/reset", headers=auth_headers)
    assert reset.status_code == 200
    after = client.get("/api/v1/dashboard/summary", headers=auth_headers)
    assert after.json()["metrics"]["total_leads"] == total


def test_csv_export_formula_injection(client, auth_headers) -> None:
    response = client.get("/api/v1/leads/export.csv", headers=auth_headers)
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    text = response.text
    assert "public_id" in text.splitlines()[0]
    for line in text.splitlines()[1:]:
        for cell in line.split(","):
            if cell[:1] in {"=", "+", "-", "@"}:
                raise AssertionError(f"unsanitized formula cell: {cell}")
