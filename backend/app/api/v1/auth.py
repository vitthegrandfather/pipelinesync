"""Login and current-user endpoints."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select

from app.api.dependencies import get_current_user, get_memory, use_memory
from app.core.config import settings
from app.core.errors import AppError
from app.core.security import create_access_token, verify_password
from app.db.models.user import User
from app.db.session import get_session_factory
from app.schemas.common import LoginRequest, LoginResponse, MeResponse
from app.services.memory import AppMemory

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(
    body: LoginRequest, request: Request, memory: Annotated[AppMemory, Depends(get_memory)]
) -> dict[str, Any]:
    email = body.email.lower()
    if use_memory():
        ws = memory.ensure_demo(
            email=settings.demo_admin_email,
            password=settings.demo_admin_password,
            name=settings.demo_admin_name,
        )
        user_id = memory.users_by_email.get(email)
        if not user_id:
            raise AppError("invalid_credentials", "Email or password is incorrect.", 401)
        ws = memory.workspaces[user_id]
        if not verify_password(body.password, str(ws.user["hashed_password"])):
            raise AppError("invalid_credentials", "Email or password is incorrect.", 401)
        token = create_access_token(user_id=str(ws.user["id"]), email=str(ws.user["email"]))
        return {
            "access_token": token,
            "token_type": "bearer",
            "user": {"id": ws.user["id"], "email": ws.user["email"], "name": ws.user["name"]},
        }
    factory = get_session_factory()
    async with factory() as session:
        user = await session.scalar(select(User).where(User.email == email, User.active.is_(True)))
        if user is None or not verify_password(body.password, user.hashed_password):
            raise AppError("invalid_credentials", "Email or password is incorrect.", 401)
        token = create_access_token(user_id=user.id, email=user.email)
        return {
            "access_token": token,
            "token_type": "bearer",
            "user": {"id": user.id, "email": user.email, "name": user.name},
        }


@router.get("/me", response_model=MeResponse)
async def me(user: Annotated[dict[str, Any], Depends(get_current_user)]) -> dict[str, Any]:
    return {"id": user["id"], "email": user["email"], "name": user["name"]}
