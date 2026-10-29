"""Persist a run's events and progress while it executes (each write is its own short transaction)."""

import logging
from typing import Any
from uuid import UUID

from app.db.session import get_db_context
from app.repositories import orchestration as repo

logger = logging.getLogger(__name__)


class DbRunStore:
    async def event(
        self, run_id: UUID | None, seq: int, t: float, kind: str, detail: dict[str, Any]
    ) -> None:
        if run_id is None:
            return
        try:
            async with get_db_context() as db:
                await repo.add_event(db, run_id=run_id, seq=seq, t=t, kind=kind, detail=detail)
        except Exception:
            logger.warning("orch_event_write_failed run=%s kind=%s", run_id, kind, exc_info=True)

    async def progress(self, run_id: UUID | None, stage: str, progress: int) -> None:
        if run_id is None:
            return
        try:
            async with get_db_context() as db:
                run = await repo.get_run(db, run_id)
                if run is not None and run.status in ("queued", "running"):
                    await repo.update_run(
                        db,
                        db_run=run,
                        update_data={
                            "status": "running",
                            "stage": stage[:200],
                            "progress": progress,
                        },
                    )
        except Exception:
            logger.warning("orch_progress_write_failed run=%s", run_id, exc_info=True)
