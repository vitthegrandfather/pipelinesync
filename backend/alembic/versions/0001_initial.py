"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-09-05
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

JSONB = postgresql.JSONB(astext_type=sa.Text())


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("email", sa.String(), nullable=False, unique=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False, server_default="admin"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "workspaces",
        sa.Column("user_id", sa.String(), primary_key=True),
        sa.Column("seeded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "api_keys",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=False, index=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("key_hash", sa.String(), nullable=False, unique=True),
        sa.Column("key_prefix", sa.String(), nullable=False),
        sa.Column("key_last4", sa.String(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "id_counters",
        sa.Column("user_id", sa.String(), primary_key=True),
        sa.Column("kind", sa.String(), primary_key=True),
        sa.Column("value", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_table(
        "integrations",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("public_id", sa.String(), nullable=False),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("mode", sa.String(), nullable=False, server_default="sandbox"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("config", JSONB, nullable=False),
        sa.Column("health_status", sa.String(), nullable=False, server_default="healthy"),
        sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("success_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failure_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("integrations_user_public_idx", "integrations", ["user_id", "public_id"], unique=True)
    op.create_table(
        "routing_rules",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("public_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("field", sa.String(), nullable=False),
        sa.Column("operator", sa.String(), nullable=False),
        sa.Column("comparison_value", sa.Text(), nullable=True),
        sa.Column("integration_id", sa.String(), nullable=False),
        sa.Column("stop_processing", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("routing_rules_user_public_idx", "routing_rules", ["user_id", "public_id"], unique=True)
    op.create_index("routing_rules_priority_idx", "routing_rules", ["user_id", "priority"])
    op.create_table(
        "leads",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("public_id", sa.String(), nullable=False),
        sa.Column("first_name", sa.Text(), nullable=True),
        sa.Column("last_name", sa.Text(), nullable=True),
        sa.Column("email", sa.Text(), nullable=True),
        sa.Column("normalized_email", sa.Text(), nullable=True),
        sa.Column("phone", sa.Text(), nullable=True),
        sa.Column("normalized_phone", sa.Text(), nullable=True),
        sa.Column("company", sa.Text(), nullable=True),
        sa.Column("job_title", sa.Text(), nullable=True),
        sa.Column("country", sa.Text(), nullable=True),
        sa.Column("service", sa.Text(), nullable=True),
        sa.Column("budget", sa.Numeric(12, 2), nullable=True),
        sa.Column("currency", sa.Text(), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("source", sa.Text(), nullable=True),
        sa.Column("external_id", sa.Text(), nullable=True),
        sa.Column("utm_source", sa.Text(), nullable=True),
        sa.Column("utm_medium", sa.Text(), nullable=True),
        sa.Column("utm_campaign", sa.Text(), nullable=True),
        sa.Column("metadata", JSONB, nullable=True),
        sa.Column("original_payload", JSONB, nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="accepted"),
        sa.Column("duplicate_of_id", sa.String(), nullable=True),
        sa.Column("duplicate_reason", sa.Text(), nullable=True),
        sa.Column("duplicate_detected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("idempotency_key", sa.Text(), nullable=True),
        sa.Column("idempotency_payload_hash", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("leads_user_public_idx", "leads", ["user_id", "public_id"], unique=True)
    op.create_index("leads_normalized_email_idx", "leads", ["user_id", "normalized_email"])
    op.create_index("leads_normalized_phone_idx", "leads", ["user_id", "normalized_phone"])
    op.create_index("leads_source_external_idx", "leads", ["user_id", "source", "external_id"])
    op.create_index("leads_created_idx", "leads", ["user_id", "created_at"])
    op.create_index("leads_status_idx", "leads", ["user_id", "status"])
    op.create_table(
        "routing_decisions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("lead_id", sa.String(), nullable=False),
        sa.Column("matched_rule_id", sa.String(), nullable=True),
        sa.Column("integration_id", sa.String(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("evaluation_log", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("routing_decisions_lead_idx", "routing_decisions", ["lead_id"])
    op.create_table(
        "deliveries",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("public_id", sa.String(), nullable=False),
        sa.Column("lead_id", sa.String(), nullable=False),
        sa.Column("integration_id", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("provider_contact_id", sa.Text(), nullable=True),
        sa.Column("provider_deal_id", sa.Text(), nullable=True),
        sa.Column("request_payload", JSONB, nullable=True),
        sa.Column("response_payload", JSONB, nullable=True),
        sa.Column("error_code", sa.Text(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("next_retry_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("force_fail", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("deliveries_user_public_idx", "deliveries", ["user_id", "public_id"], unique=True)
    op.create_index("deliveries_status_idx", "deliveries", ["user_id", "status"])
    op.create_index("deliveries_lead_idx", "deliveries", ["lead_id"])
    op.create_index("deliveries_created_idx", "deliveries", ["user_id", "created_at"])
    op.create_table(
        "delivery_attempts",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("delivery_id", sa.String(), nullable=False),
        sa.Column("attempt_number", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("request_payload", JSONB, nullable=True),
        sa.Column("response_payload", JSONB, nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("delivery_attempts_delivery_idx", "delivery_attempts", ["delivery_id", "attempt_number"])
    op.create_table(
        "audit_events",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("actor_type", sa.String(), nullable=False),
        sa.Column("actor_id", sa.String(), nullable=True),
        sa.Column("entity_type", sa.String(), nullable=False),
        sa.Column("entity_id", sa.String(), nullable=False),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("event_data", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("audit_events_entity_idx", "audit_events", ["user_id", "entity_type", "entity_id", "created_at"])
    op.create_table(
        "idempotency_records",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("key", sa.String(), nullable=False),
        sa.Column("payload_hash", sa.String(), nullable=False),
        sa.Column("lead_id", sa.String(), nullable=True),
        sa.Column("response", JSONB, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idempotency_user_key_idx", "idempotency_records", ["user_id", "key"], unique=True)


def downgrade() -> None:
    for table in [
        "idempotency_records",
        "audit_events",
        "delivery_attempts",
        "deliveries",
        "routing_decisions",
        "leads",
        "routing_rules",
        "integrations",
        "id_counters",
        "api_keys",
        "workspaces",
        "users",
    ]:
        op.drop_table(table)
