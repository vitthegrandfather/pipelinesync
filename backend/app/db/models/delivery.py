"""Delivery and delivery-attempt models."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Delivery(Base):
    __tablename__ = "deliveries"
    __table_args__ = (
        Index("deliveries_user_public_idx", "user_id", "public_id", unique=True),
        Index("deliveries_status_idx", "user_id", "status"),
        Index("deliveries_lead_idx", "lead_id"),
        Index("deliveries_created_idx", "user_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, nullable=False)
    public_id: Mapped[str] = mapped_column(String, nullable=False)
    lead_id: Mapped[str] = mapped_column(String, nullable=False)
    integration_id: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    provider_contact_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    provider_deal_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    request_payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    response_payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    error_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_retry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    force_fail: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class DeliveryAttempt(Base):
    __tablename__ = "delivery_attempts"
    __table_args__ = (Index("delivery_attempts_delivery_idx", "delivery_id", "attempt_number"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, nullable=False)
    delivery_id: Mapped[str] = mapped_column(String, nullable=False)
    attempt_number: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    request_payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    response_payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
