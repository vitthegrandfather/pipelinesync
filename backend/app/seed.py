"""Seed the demo administrator, API key, integrations, rules, and 22 fictional leads."""

from __future__ import annotations

import asyncio

from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.db.session import get_session_factory
from app.services.sql_workspace import ensure_demo_user, reset_workspace, seed_user_workspace

configure_logging()
log = get_logger("pipelinesync.seed")


async def seed() -> None:
    factory = get_session_factory()
    async with factory() as session:
        user = await ensure_demo_user(
            session,
            email=settings.demo_admin_email,
            password=settings.demo_admin_password,
            name=settings.demo_admin_name,
        )
        from sqlalchemy import select

        from app.db.models.lead import Lead

        count = await session.scalar(select(Lead.id).where(Lead.user_id == user.id).limit(1))
        if count:
            await reset_workspace(session, user.id)
        else:
            await seed_user_workspace(session, user)
        await session.commit()
        log.info("seed_complete", user_id=user.id, email=user.email)


def main() -> None:
    asyncio.run(seed())


if __name__ == "__main__":
    main()
