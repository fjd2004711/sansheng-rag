"""Runs executing in this process, so a user can cancel one. Process-local like the runs themselves."""

from __future__ import annotations

import asyncio
from uuid import UUID

CANCELLED_MESSAGE = "已由用户取消"

_tasks: dict[UUID, asyncio.Task[None]] = {}
_cancelled: set[UUID] = set()


def register(run_id: UUID) -> None:
    """Track the task executing ``run_id`` (call from inside it)."""
    task = asyncio.current_task()
    if task is not None:
        _tasks[run_id] = task


def release(run_id: UUID) -> bool:
    """Forget the run; True when the user had cancelled it."""
    _tasks.pop(run_id, None)
    was_cancelled = run_id in _cancelled
    _cancelled.discard(run_id)
    return was_cancelled


def cancel(run_id: UUID) -> bool:
    """Ask the executing task to stop; False when this process is not running it."""
    task = _tasks.get(run_id)
    if task is None or task.done():
        return False
    _cancelled.add(run_id)
    task.cancel()
    return True
