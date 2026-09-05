"""Auth, API-key, and workspace dependencies."""

from __future__ import annotations

import time
from collections import defaultdict
from typing import Annotated, Any

from fastapi import Depends, Header, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import ExpiredSignatureError, InvalidTokenError

from app.core.config import settings
from app.core.errors import AppError
from app.core.security import decode_access_token, hash_api_key
from app.services.memory import AppMemory, MemoryWorkspace

bearer = HTTPBearer(auto_error=False)
_rate: dict[str, list[float]] = defaultdict(list)


def request_id_of(request: Request) -> str:
    return str(getattr(request.state, "request_id", "req_unknown"))


def get_memory(request: Request) -> AppMemory:
    return request.app.state.memory


def use_memory() -> bool:
    """In-memory store for tests and the Docker development demo."""
    return bool(settings.testing) or settings.environment in {"test", "development"}


def enforce_intake_rate(api_key: str, request: Request) -> None:
    now = time.time()
    window = settings.intake_rate_window_seconds
    bucket = _rate[api_key]
    _rate[api_key] = [t for t in bucket if now - t < window]
    if len(_rate[api_key]) >= settings.intake_rate_limit:
        raise AppError("rate_limited", "Intake rate limit exceeded. Try again shortly.", 429)
    _rate[api_key].append(now)


async def get_current_user(
    request: Request,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    memory: Annotated[AppMemory, Depends(get_memory)],
) -> dict[str, Any]:
    if creds is None or creds.scheme.lower() != "bearer":
        raise AppError("unauthorized", "Sign in required.", 401)
    try:
        payload = decode_access_token(creds.credentials)
    except ExpiredSignatureError as exc:
        raise AppError("token_expired", "Access token expired.", 401) from exc
    except InvalidTokenError as exc:
        raise AppError("unauthorized", "Invalid access token.", 401) from exc
    user_id = str(payload.get("sub") or "")
    if use_memory():
        ws = memory.by_user_id(user_id)
        if ws is None or not ws.user.get("active"):
            raise AppError("unauthorized", "Unknown user.", 401)
        return {"id": ws.user["id"], "email": ws.user["email"], "name": ws.user["name"], "workspace": ws}

    from sqlalchemy import select

    from app.db.models.user import User
    from app.db.session import get_session_factory

    factory = get_session_factory()
    async with factory() as session:
        user = await session.scalar(select(User).where(User.id == user_id, User.active.is_(True)))
        if user is None:
            raise AppError("unauthorized", "Unknown user.", 401)
        return {"id": user.id, "email": user.email, "name": user.name}


async def get_workspace(
    user: Annotated[dict[str, Any], Depends(get_current_user)],
    memory: Annotated[AppMemory, Depends(get_memory)],
) -> MemoryWorkspace:
    ws = user.get("workspace")
    if ws is not None:
        return ws
    demo = memory.ensure_demo(
        email=settings.demo_admin_email,
        password=settings.demo_admin_password,
        name=settings.demo_admin_name,
    )
    return demo


async def require_api_key(
    request: Request,
    memory: Annotated[AppMemory, Depends(get_memory)],
    x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None,
) -> MemoryWorkspace:
    if not x_api_key:
        raise AppError("unauthorized", "Missing API key.", 401)
    enforce_intake_rate(x_api_key, request)
    if use_memory():
        ws = memory.by_api_key(x_api_key)
        if ws is None:
            raise AppError("unauthorized", "Invalid API key.", 401)
        return ws

    from sqlalchemy import select

    from app.db.models.user import ApiKey
    from app.db.session import get_session_factory

    factory = get_session_factory()
    async with factory() as session:
        hashed = hash_api_key(x_api_key)
        key = await session.scalar(select(ApiKey).where(ApiKey.key_hash == hashed, ApiKey.active.is_(True)))
        if key is None:
            raise AppError("unauthorized", "Invalid API key.", 401)
        request.state.api_user_id = key.user_id
        return memory.ensure_demo(
            email=settings.demo_admin_email,
            password=settings.demo_admin_password,
            name=settings.demo_admin_name,
        )
