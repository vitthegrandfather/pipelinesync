"""FastAPI application entrypoint."""

from __future__ import annotations

import time
import uuid
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.v1.auth import router as auth_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.deliveries import router as deliveries_router
from app.api.v1.demo import router as demo_router
from app.api.v1.integrations import router as integrations_router
from app.api.v1.leads import router as leads_router
from app.api.v1.routing_rules import router as routing_router
from app.api.v1.webhooks import router as intake_router
from app.core.config import settings
from app.core.errors import AppError, error_body
from app.core.logging import configure_logging, get_logger
from app.core.time import iso, utc_now
from app.services.memory import AppMemory
from app.services.normalization import IntakeValidationError

configure_logging()
log = get_logger("pipelinesync.api")

MAX_BODY_BYTES = 256_000


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.memory.ensure_demo(
        email=settings.demo_admin_email,
        password=settings.demo_admin_password,
        name=settings.demo_admin_name,
    )
    if not settings.testing and "sqlite" not in settings.database_url:
        try:
            from sqlalchemy import select

            from app.db.models.user import Workspace
            from app.db.session import get_session_factory
            from app.services.sql_workspace import ensure_demo_user, seed_user_workspace

            factory = get_session_factory()
            async with factory() as session:
                user = await ensure_demo_user(
                    session,
                    email=settings.demo_admin_email,
                    password=settings.demo_admin_password,
                    name=settings.demo_admin_name,
                )
                existing = await session.scalar(select(Workspace).where(Workspace.user_id == user.id))
                if existing is None:
                    await seed_user_workspace(session, user)
                await session.commit()
        except Exception:
            log.warning("sql_seed_skipped", exc_info=True)
    yield


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        request_id = request.headers.get("X-Request-ID") or f"req_{uuid.uuid4().hex[:20]}"
        request.state.request_id = request_id
        started = time.perf_counter()
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > MAX_BODY_BYTES:
            return JSONResponse(
                status_code=413,
                content=error_body("payload_too_large", "Request body exceeds 256 KB.", request_id),
                headers={"X-Request-ID": request_id},
            )
        try:
            response = await call_next(request)
        except (AppError, IntakeValidationError, RequestValidationError):
            raise
        except Exception:
            duration_ms = int((time.perf_counter() - started) * 1000)
            log.exception(
                "unhandled_error",
                request_id=request_id,
                route=request.url.path,
                method=request.method,
                duration_ms=duration_ms,
            )
            return JSONResponse(
                status_code=500,
                content=error_body("internal_error", "An unexpected error occurred.", request_id),
                headers={"X-Request-ID": request_id},
            )
        duration_ms = int((time.perf_counter() - started) * 1000)
        response.headers["X-Request-ID"] = request_id
        log.info(
            "request",
            request_id=request_id,
            route=request.url.path,
            method=request.method,
            status=response.status_code,
            duration_ms=duration_ms,
        )
        return response


def create_app() -> FastAPI:
    app = FastAPI(
        title="PipelineSync",
        description=(
            "CRM lead routing and webhook automation. "
            "All CRM connectors in this project are sandbox adapters. "
            "Demo contacts and companies are fictional."
        ),
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestContextMiddleware)
    app.state.memory = AppMemory()

    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError) -> JSONResponse:
        rid = str(getattr(request.state, "request_id", "req_unknown"))
        return JSONResponse(status_code=exc.status_code, content=error_body(exc.code, exc.message, rid))

    @app.exception_handler(IntakeValidationError)
    async def _intake_error(request: Request, exc: IntakeValidationError) -> JSONResponse:
        rid = str(getattr(request.state, "request_id", "req_unknown"))
        return JSONResponse(status_code=exc.http_status, content=error_body(exc.code, exc.message, rid))

    @app.exception_handler(RequestValidationError)
    async def _valid_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        rid = str(getattr(request.state, "request_id", "req_unknown"))
        message = "; ".join(f"{'.'.join(str(x) for x in err.get('loc', []))}: {err.get('msg')}" for err in exc.errors())
        return JSONResponse(
            status_code=422,
            content=error_body("invalid_payload", message or "Request failed validation.", rid),
        )

    prefix = "/api/v1"
    app.include_router(auth_router, prefix=prefix)
    app.include_router(intake_router, prefix=prefix)
    app.include_router(leads_router, prefix=prefix)
    app.include_router(dashboard_router, prefix=prefix)
    app.include_router(deliveries_router, prefix=prefix)
    app.include_router(integrations_router, prefix=prefix)
    app.include_router(routing_router, prefix=prefix)
    app.include_router(demo_router, prefix=prefix)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {
            "status": "ok",
            "service": "pipelinesync",
            "mode": "sandbox",
            "time": iso(utc_now()) or "",
        }

    @app.get("/ready")
    async def ready() -> dict[str, str]:
        db_status = "memory" if settings.testing else "unknown"
        if not settings.testing:
            try:
                from sqlalchemy import text

                from app.db.session import get_engine

                engine = get_engine()
                async with engine.connect() as conn:
                    await conn.execute(text("select 1"))
                db_status = "ok"
            except Exception:
                db_status = "unavailable"
        status = "ok" if db_status in {"ok", "memory"} else "degraded"
        return {"status": status, "database": db_status}

    return app


app = create_app()
