"""Application settings loaded from the environment."""

from __future__ import annotations

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "pipelinesync"
    environment: str = "development"
    testing: bool = False

    database_url: str = "postgresql+asyncpg://pipelinesync:pipelinesync@localhost:5432/pipelinesync"
    redis_url: str = "redis://localhost:6379/0"
    secret_key: str = "change-me-in-production-use-a-long-random-string"
    cors_origins: str = "http://localhost:8080,http://localhost:3000,http://127.0.0.1:8080"

    demo_api_key: str = "demo-api-key"
    demo_admin_email: str = "admin@pipelinesync.demo"
    demo_admin_password: str = "demo12345"
    demo_admin_name: str = "Demo Admin"

    access_token_expire_minutes: int = 480
    algorithm: str = "HS256"

    intake_rate_limit: int = 60
    intake_rate_window_seconds: int = 60

    seed_on_startup: bool = True

    log_level: str = "INFO"
    log_json: bool = False

    @field_validator("testing", mode="before")
    @classmethod
    def _parse_testing(cls, value: object) -> bool:
        if isinstance(value, bool):
            return value
        if value is None:
            return False
        return str(value).strip().lower() in {"1", "true", "yes", "on"}

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def sync_database_url(self) -> str:
        url = self.database_url
        url = url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
        url = url.replace("postgresql+psycopg://", "postgresql+psycopg2://")
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
