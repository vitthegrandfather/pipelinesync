"""Lead intake, list, detail, routing, integration, and dashboard schemas."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.common import DeliveryStatus, LeadStatus, Provider


class LeadIntakeInput(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    company: str | None = None
    job_title: str | None = None
    country: str | None = None
    service: str | None = None
    budget: float | str | None = None
    currency: str | None = None
    message: str | None = None
    source: str | None = None
    utm_source: str | None = None
    utm_medium: str | None = None
    utm_campaign: str | None = None
    external_id: str | None = None
    metadata: dict[str, Any] | None = None
    simulate_failure: bool = False
    idempotency_key: str | None = None


class NormalizedLead(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    normalized_email: str | None = None
    phone: str | None = None
    normalized_phone: str | None = None
    company: str | None = None
    job_title: str | None = None
    country: str | None = None
    service: str | None = None
    budget: float | None = None
    currency: str | None = None
    message: str | None = None
    source: str | None = None
    utm_source: str | None = None
    utm_medium: str | None = None
    utm_campaign: str | None = None
    external_id: str | None = None
    metadata: dict[str, Any] | None = None


class PipelineStep(BaseModel):
    id: str
    label: str
    status: Literal["ok", "warn", "error", "pending"]
    timestamp: str
    detail: str | None = None


class IntakeResult(BaseModel):
    lead_id: str
    lead_internal_id: str
    status: LeadStatus
    duplicate: bool
    duplicate_of_id: str | None
    duplicate_reason: str | None
    assigned_destination: str
    delivery_status: DeliveryStatus
    delivery_id: str
    steps: list[PipelineStep]
    replayed: bool = False


class IntakePublicResponse(BaseModel):
    lead_id: str
    status: Literal["accepted"] = "accepted"
    duplicate: bool
    assigned_destination: str
    delivery_status: DeliveryStatus


class LeadFilter(BaseModel):
    q: str = ""
    status: str = ""
    duplicate: Literal["all", "yes", "no"] = "all"
    source: str = ""
    service: str = ""
    country: str = ""
    destination: str = ""
    delivery_status: str = ""
    from_: str = Field(default="", alias="from")
    to: str = ""
    sort: str = "created_at"
    dir: Literal["asc", "desc"] = "desc"
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=12, ge=1, le=100)

    model_config = {"populate_by_name": True}


class LeadListItem(BaseModel):
    public_id: str
    first_name: str = ""
    last_name: str = ""
    company: str = ""
    service: str = ""
    source: str = ""
    status: str
    created_at: str
    destination: str
    delivery_status: str
    duplicate: bool


class LeadListResponse(BaseModel):
    items: list[LeadListItem]
    total: int
    page: int
    page_size: int
    facets: dict[str, list[str]]


class RuleEvaluation(BaseModel):
    rule_id: str
    public_id: str
    name: str
    priority: int
    field: str
    operator: str
    comparison_value: str | None
    matched: bool
    skipped: bool
    skip_reason: str | None = None
    detail: str


class RoutingResult(BaseModel):
    matched_rule_id: str | None
    matched_rule_public_id: str | None
    matched_rule_name: str | None
    integration_id: str
    integration_name: str
    provider: str
    reason: str
    evaluation_log: list[RuleEvaluation]


class RoutingRuleIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    priority: int = Field(ge=1, le=9999)
    enabled: bool = True
    field: str
    operator: str
    comparison_value: str | None = None
    integration_id: str
    stop_processing: bool = True


class RoutingRuleOut(BaseModel):
    id: str
    public_id: str
    name: str
    priority: int
    enabled: bool
    field: str
    operator: str
    comparison_value: str
    integration_id: str
    destination: str
    provider: str
    stop_processing: bool
    created_at: str
    updated_at: str


class RoutingRuleSave(RoutingRuleIn):
    id: str | None = None


class SimulateRoutingIn(BaseModel):
    lead_id: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    company: str | None = None
    country: str | None = None
    service: str | None = None
    budget: float | str | None = None
    currency: str | None = None
    source: str | None = None


class IntegrationOut(BaseModel):
    id: str
    public_id: str
    provider: Provider
    name: str
    mode: str
    enabled: bool
    health_status: str
    last_checked_at: str | None
    last_success_at: str | None
    success_count: int
    failure_count: int


class IntegrationHealth(BaseModel):
    status: Literal["healthy", "degraded", "down"]
    provider: Provider
    mode: Literal["sandbox"] = "sandbox"
    latency_ms: int
    message: str
    checked_at: str


class DeliveryListItem(BaseModel):
    id: str
    public_id: str
    lead_public_id: str
    provider: str
    provider_key: str
    status: str
    attempt_count: int
    error_message: str | None
    duration_ms: int | None
    next_retry_at: str | None
    created_at: str


class DashboardMetrics(BaseModel):
    total_leads: int
    qualified_leads: int
    duplicate_rate: float
    delivery_success_rate: float
    failed_deliveries: int
    avg_delivery_ms: int


class DashboardResponse(BaseModel):
    metrics: DashboardMetrics
    volume: list[dict[str, Any]]
    sources: list[dict[str, Any]]
    delivery_breakdown: dict[str, int]
    recent_leads: list[LeadListItem]
    recent_failures: list[dict[str, Any]]
