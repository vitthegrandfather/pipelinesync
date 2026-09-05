"""Celery tasks for sandbox CRM delivery.

Claiming a delivery uses an atomic SQL status transition so two workers cannot
process the same row at once (see ``process_delivery``).
"""

from __future__ import annotations

import asyncio

from app.core.logging import get_logger
from app.workers.celery_app import celery_app

log = get_logger("pipelinesync.worker")


def enqueue_delivery(delivery_id: str, user_id: str, countdown: int = 0) -> None:
    deliver_lead.apply_async(args=[delivery_id, user_id], countdown=max(0, countdown))


@celery_app.task(name="pipelinesync.deliver_lead", bind=True, max_retries=0)
def deliver_lead(self, delivery_id: str, user_id: str) -> dict[str, str]:
    log.info("delivery_started", delivery_id=delivery_id, user_id=user_id)

    async def _run() -> dict[str, str]:
        from app.db.session import get_session_factory
        from app.services.delivery import process_delivery

        factory = get_session_factory()
        async with factory() as session:
            result = await process_delivery(session, user_id, delivery_id, simulate_now=False)
            await session.commit()
            return {"status": str(result.get("status"))}

    status = asyncio.run(_run())
    log.info("delivery_finished", delivery_id=delivery_id, **status)
    return status
