"""Routing rule and routing decision models."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RoutingRule(Base):
    __tablename__ = "routing_rules"
    __table_args__ = (
        Index("routing_rules_user_public_idx", "user_id", "public_id", unique=True),
        Index("routing_rules_priority_idx", "user_id", "priority"),
        Index("routing_rules_user_idx", "user_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, nullable=False)
    public_id: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    priority: Mapped[int] = mapped_column(Integer, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    field: Mapped[str] = mapped_column(String, nullable=False)
    operator: Mapped[str] = mapped_column(String, nullable=False)
    comparison_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    integration_id: Mapped[str] = mapped_column(String, nullable=False)
    stop_processing: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class RoutingDecision(Base):
    __tablename__ = "routing_decisions"
    __table_args__ = (
        Index("routing_decisions_lead_idx", "lead_id"),
        Index("routing_decisions_user_idx", "user_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, nullable=False)
    lead_id: Mapped[str] = mapped_column(String, nullable=False)
    matched_rule_id: Mapped[str | None] = mapped_column(String, nullable=True)
    integration_id: Mapped[str | None] = mapped_column(String, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    evaluation_log: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
