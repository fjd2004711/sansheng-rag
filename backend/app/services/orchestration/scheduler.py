"""A small asyncio scheduler: ready-set dispatch, resource pools, retries, budgets and runtime task insertion.

It knows nothing about reports. Work is a ``Group`` (a workflow node) holding ``Task`` s; a group may be *expanded*
when its dependencies finish (a map node fans out over data that only exists by then), and running handlers may add
new groups (a repair round) while the run is in flight.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Literal

from app.services.orchestration.exceptions import BudgetExceededError

logger = logging.getLogger(__name__)

Status = Literal["pending", "running", "done", "failed", "skipped"]
EventSink = Callable[[str, dict[str, Any]], Awaitable[None]]


@dataclass
class Task:
    id: str
    group: str
    run: Callable[[], Awaitable[Any]]
    label: str = ""
    priority: int = 5
    pool: str = "none"
    essential: bool = True
    retries: int = 1
    timeout: float = 900.0
    status: Status = "pending"
    attempts: int = 0
    queued_at: float = 0.0
    started_at: float | None = None
    ended_at: float | None = None
    error: str | None = None
    result: Any = None


@dataclass
class Group:
    id: str
    deps: list[str] = field(default_factory=list)
    expand: Callable[[], Awaitable[list[Task]]] | None = None
    tasks: list[Task] = field(default_factory=list)
    priority: int = 5
    essential: bool = True
    expanded: bool = False
    # A group nobody depends on and nobody has to wait for (a triggered loop) is added with deps already met.
    done_event: asyncio.Event = field(default_factory=asyncio.Event)

    @property
    def finished(self) -> bool:
        return self.expanded and all(t.status in ("done", "failed", "skipped") for t in self.tasks)

    @property
    def ok(self) -> bool:
        return self.finished and all(t.status in ("done", "skipped") for t in self.tasks)


class Scheduler:
    def __init__(
        self,
        *,
        pools: dict[str, int],
        emit: EventSink,
        budget_ok: Callable[[], bool] = lambda: True,
        hard_limit_hit: Callable[[], bool] = lambda: False,
        is_retryable: Callable[[BaseException], bool] = lambda exc: True,
        on_model_error: Callable[[BaseException], Awaitable[bool]] | None = None,
        retry_delay: float = 1.0,
    ) -> None:
        self._pools = {name: asyncio.Semaphore(size) for name, size in pools.items()}
        self._emit = emit
        self._budget_ok = budget_ok
        self._hard_limit_hit = hard_limit_hit
        self._is_retryable = is_retryable
        self._on_model_error = on_model_error
        self._retry_delay = retry_delay
        self.groups: dict[str, Group] = {}
        self._running: dict[asyncio.Task[None], Task] = {}
        self._wake = asyncio.Event()
        self._closed = False

    # ---- building the plan ---------------------------------------------------------------------

    def add_group(self, group: Group) -> Group:
        self.groups[group.id] = group
        self._wake.set()
        return group

    async def run_group(self, group: Group) -> bool:
        """Insert ``group`` now (used by running handlers, e.g. a repair round) and wait for it."""
        self.add_group(group)
        if group.expanded:
            for task in group.tasks:
                task.queued_at = time.monotonic()
            await self._emit("group_expanded", {"group": group.id, "tasks": [t.id for t in group.tasks]})
        await group.done_event.wait()
        return group.ok

    # ---- the loop ------------------------------------------------------------------------------

    async def run(self) -> None:
        try:
            while True:
                await self._expand_ready()
                self._skip_blocked()
                await self._launch_ready()
                self._settle_groups()
                if not self._running:
                    if self._has_unfinished():
                        # Nothing runs and nothing can become ready: a failed dependency. Mark and stop.
                        self._abandon_remaining("上游任务失败，未执行")
                    break
                self._wake.clear()
                waiters = [*self._running.keys(), asyncio.ensure_future(self._wake.wait())]
                done, pending = await asyncio.wait(waiters, return_when=asyncio.FIRST_COMPLETED)
                for extra in pending:
                    if extra not in self._running:
                        extra.cancel()
                for finished in done:
                    self._running.pop(finished, None)
        finally:
            self._closed = True
            for runner in list(self._running):
                runner.cancel()
            self._settle_groups()

    async def _expand_ready(self) -> None:
        for group in list(self.groups.values()):
            if group.expanded or not self._deps_ok(group):
                continue
            if group.expand is not None:
                try:
                    group.tasks = await group.expand()
                except Exception as exc:  # expansion failure fails the group, not the run
                    logger.warning("expand_failed group=%s", group.id, exc_info=True)
                    group.tasks = [
                        Task(
                            id=f"{group.id}#expand",
                            group=group.id,
                            run=_noop,
                            status="failed",
                            error=str(exc),
                        )
                    ]
            group.expanded = True
            for task in group.tasks:
                task.queued_at = time.monotonic()
            await self._emit(
                "group_expanded", {"group": group.id, "tasks": [t.id for t in group.tasks]}
            )

    def _deps_ok(self, group: Group) -> bool:
        return all((d := self.groups.get(dep)) is not None and d.ok for dep in group.deps)

    def _skip_blocked(self) -> None:
        for group in self.groups.values():
            if group.expanded:
                continue
            for dep in group.deps:
                d = self.groups.get(dep)
                if d is not None and d.finished and not d.ok:
                    group.expanded = True
                    group.tasks = [
                        Task(
                            id=f"{group.id}#blocked",
                            group=group.id,
                            run=_noop,
                            status="skipped",
                            error=f"依赖 {dep} 失败",
                        )
                    ]
                    break

    async def _launch_ready(self) -> None:
        ready = [
            t for g in self.groups.values() if g.expanded for t in g.tasks if t.status == "pending"
        ]
        for task in sorted(ready, key=lambda t: (t.priority, t.queued_at)):
            if not task.essential and not self._budget_ok():
                task.status = "skipped"
                task.error = "预算已用尽，已取消这项非必要任务"
                await self._emit(
                    "task_skipped", {"task": task.id, "group": task.group, "reason": task.error}
                )
                continue
            task.status = "running"
            runner = asyncio.ensure_future(self._execute(task))
            self._running[runner] = task

    def _settle_groups(self) -> None:
        for group in self.groups.values():
            if group.finished and not group.done_event.is_set():
                group.done_event.set()

    def _has_unfinished(self) -> bool:
        return any(not g.finished for g in self.groups.values() if g.deps or g.expanded or g.expand)

    def _abandon_remaining(self, reason: str) -> None:
        for group in self.groups.values():
            if group.finished:
                continue
            if not group.expanded:
                group.expanded = True
                group.tasks = [
                    Task(
                        id=f"{group.id}#skipped",
                        group=group.id,
                        run=_noop,
                        status="skipped",
                        error=reason,
                    )
                ]
            for task in group.tasks:
                if task.status == "pending":
                    task.status = "skipped"
                    task.error = reason
        self._settle_groups()

    # ---- one task --------------------------------------------------------------------------------

    async def _execute(self, task: Task) -> None:
        sem = self._pools.get(task.pool)
        try:
            while True:
                task.attempts += 1
                if sem is not None:
                    async with sem:
                        await self._attempt(task)
                else:
                    await self._attempt(task)
                if task.status != "pending":
                    return
                await asyncio.sleep(self._retry_delay)
        finally:
            self._wake.set()

    async def _attempt(self, task: Task) -> None:
        task.started_at = time.monotonic()
        await self._emit(
            "task_start",
            {
                "task": task.id,
                "group": task.group,
                "label": task.label,
                "attempt": task.attempts,
                "pool": task.pool,
            },
        )
        try:
            if self._hard_limit_hit() and task.essential:
                raise BudgetExceededError("超出预算上限")
            task.result = await asyncio.wait_for(task.run(), timeout=task.timeout)
        except asyncio.CancelledError:
            task.status, task.error, task.ended_at = "skipped", "已取消", time.monotonic()
            raise
        except BaseException as exc:
            task.error = f"{type(exc).__name__}: {str(exc)[:240]}"
            switched = self._on_model_error is not None and await self._on_model_error(exc)
            if switched:
                task.status = "pending"  # same attempt budget; a different model gets a free try
                task.attempts -= 1
                await self._emit(
                    "task_retry", {"task": task.id, "reason": "model_fallback", "error": task.error}
                )
                return
            if (
                isinstance(exc, BudgetExceededError)
                or not self._is_retryable(exc)
                or task.attempts > task.retries
            ):
                task.status, task.ended_at = "failed", time.monotonic()
                await self._emit(
                    "task_failed",
                    {
                        "task": task.id,
                        "group": task.group,
                        "error": task.error,
                        "essential": task.essential,
                    },
                )
                return
            task.status = "pending"
            await self._emit(
                "task_retry", {"task": task.id, "reason": "error", "error": task.error}
            )
            return
        task.status, task.error, task.ended_at = "done", None, time.monotonic()
        await self._emit(
            "task_done",
            {
                "task": task.id,
                "group": task.group,
                "seconds": round(task.ended_at - (task.started_at or task.ended_at), 2),
            },
        )


async def _noop() -> None:
    return None
