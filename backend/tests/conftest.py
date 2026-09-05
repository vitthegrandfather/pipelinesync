"""Pytest fixtures. Force the in-memory store so tests do not need Postgres or Redis."""

from __future__ import annotations

import os

os.environ["TESTING"] = "true"
os.environ["ENVIRONMENT"] = "test"
os.environ["SECRET_KEY"] = "test-secret-key-for-pipelinesync-unit-tests"

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings

get_settings.cache_clear()

from app.main import create_app  # noqa: E402


@pytest.fixture()
def client() -> Iterator[TestClient]:
    app = create_app()
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def auth_headers(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@pipelinesync.demo", "password": "demo12345"},
    )
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


MAYA = {
    "first_name": "Maya",
    "last_name": "Chen",
    "email": "maya.chen@example.com",
    "phone": "+44 20 7946 0958",
    "company": "Northstar Studio",
    "job_title": "Operations Manager",
    "country": "GB",
    "service": "CRM integration",
    "budget": 8500,
    "currency": "USD",
    "message": "We need to connect three website forms to our CRM and preserve campaign attribution.",
    "source": "website",
    "utm_source": "google",
    "utm_medium": "cpc",
    "utm_campaign": "crm_automation_q3",
    "external_id": "FORM-10482",
    "metadata": {"landing_page": "/crm-automation", "language": "en"},
}
