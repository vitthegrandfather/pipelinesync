"""Shared request/response schemas."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field


class ErrorDetail(BaseModel):
    code: str
    message: str
    request_id: str


class ErrorResponse(BaseModel):
    error: ErrorDetail


class HealthResponse(BaseModel):
    status: str
    service: str
    mode: str
    time: str


class ReadyResponse(BaseModel):
    status: str
    database: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict[str, Any]


class MeResponse(BaseModel):
    id: str
    email: str
    name: str


class OkResponse(BaseModel):
    ok: bool = True


class ApiKeyOut(BaseModel):
    id: str
    name: str
    masked: str
    active: bool
    last_used_at: str | None
    created_at: str


class SettingsResponse(BaseModel):
    api_keys: list[ApiKeyOut]
    notice: str = (
        "Demo environment. All contacts and companies are fictional. "
        "CRM providers use deterministic sandbox adapters. No live credentials are in use."
    )


Provider = Literal["hubspot", "pipedrive", "zoho", "webhook"]
LeadStatus = Literal["accepted", "qualified", "duplicate"]
DeliveryStatus = Literal[
    "queued",
    "processing",
    "delivered",
    "failed",
    "retry_scheduled",
    "dead_letter",
]
RoutingOperator = Literal[
    "equals",
    "does_not_equal",
    "contains",
    "greater_than",
    "less_than",
    "is_empty",
    "is_not_empty",
]
