"""Compile a validated bundle into scheduler groups and run it; record every step as a replayable event."""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Protocol
from uuid import UUID

from app.core.llm_runtime import LLMRuntime, use_llm
from app.core.usage_meter import UsageMeter, use_meter
from app.services.orchestration.exceptions import BudgetExceededError
from app.services.orchestration.scheduler import Group, Scheduler, Task
from app.services.orchestration.skills import SKILLS, SkillCtx, expand_items, item_label, run_gate
from app.services.orchestration.spec import Bundle, NodeSpec
from app.services.orchestration.state import Budget, ModelController, RunState, default_runtime
from app.services.research.facade import ResearchService
from app.services.research.report_builder import ReportBuilder

logger = logging.getLogger(__name__)

_MODEL_ERROR_MARKERS = (
    "insufficient_quota",
    "Free quota",
    "PermissionDenied",
    "AuthenticationError",
    "RateLimit",
    "APIConnection",
)


class RunStore(Protocol):
    async def event(
        self, run_id: UUID | None, seq: int, t: float, kind: str, detail: dict[str, Any]
    ) -> None: ...

    async def progress(self, run_id: UUID | None, stage: str, progress: int) -> None: ...


class NullStore:
    async def event(
        self, run_id: UUID | None, seq: int, t: float, kind: str, detail: dict[str, Any]
    ) -> None:
        return None

    async def progress(self, run_id: UUID | None, stage: str, progress: int) -> None:
        return None


@dataclass
class Outcome:
    status: str  # done | failed
    result: dict[str, Any] | None = None
    metrics: dict[str, Any] = field(default_factory=dict)
    error: str | None = None
    events: list[dict[str, Any]] = field(default_factory=list)


def is_model_error(exc: BaseException) -> bool:
    text = f"{type(exc).__name__} {exc}"
    return any(marker in text for marker in _MODEL_ERROR_MARKERS)


class OrchestrationEngine:
    def __init__(self, *, research: ResearchService, store: RunStore | None = None) -> None:
        self._research = research
        self._store = store or NullStore()

    async def execute(
        self,
        bundle: Bundle,
        *,
        topic: str,
        run_input: dict[str, Any] | None = None,
        run_id: UUID | None = None,
        runtime: LLMRuntime | None = None,
    ) -> Outcome:
        run = _Run(self._research, self._store, bundle, topic, run_input or {}, run_id, runtime)
        return await run.execute()


class _Run:
    def __init__(
        self,
        research: ResearchService,
        store: RunStore,
        bundle: Bundle,
        topic: str,
        run_input: dict[str, Any],
        run_id: UUID | None,
        runtime: LLMRuntime | None,
    ) -> None:
        policy = bundle.workflow.policy
        self.bundle, self.store, self.run_id = bundle, store, run_id
        self.meter = UsageMeter()
        self.budget = Budget(policy.max_tokens, policy.max_seconds, self.meter)
        self.models = ModelController(runtime or default_runtime(), policy)
        self.builder = ReportBuilder(research)
        self.state = RunState(topic=topic, input=run_input)
        self.events: list[dict[str, Any]] = []
        self._seq = 0
        self._t0 = time.monotonic()
        self._known = 0
        self._done = 0
        self.sched = Scheduler(
            pools={"search": policy.search_concurrency, "llm": policy.llm_concurrency},
            emit=self.emit,
            budget_ok=self.budget.ok,
            hard_limit_hit=self.budget.hard_limit_hit,
            is_retryable=lambda exc: not isinstance(exc, BudgetExceededError),
            on_model_error=self._on_model_error,
        )

    # ---- events --------------------------------------------------------------------------------------

    async def emit(self, kind: str, detail: dict[str, Any]) -> None:
        self._seq += 1
        t = round(time.monotonic() - self._t0, 3)
        self.events.append({"seq": self._seq, "t": t, "kind": kind, "detail": detail})
        await self.store.event(self.run_id, self._seq, t, kind, detail)
        if kind == "group_expanded":
            self._known += len(detail["tasks"])
        elif kind in ("task_done", "task_skipped"):
            self._done += 1
            ahead = sum(1 for g in self.sched.groups.values() if not g.expanded)
            pct = min(99, int(100 * self._done / max(self._known + ahead, 1)))
            await self.store.progress(
                self.run_id, str(detail.get("label") or detail.get("task", "")), pct
            )

    async def _on_model_error(self, exc: BaseException) -> bool:
        if is_model_error(exc) and self.models.demote(str(exc)):
            await self.emit("model_fallback", {"to": self.models.current, "error": str(exc)[:160]})
            return True
        return False

    # ---- building tasks ------------------------------------------------------------------------------

    def _wrap(
        self, agent_name: str, fn: Callable[[], Awaitable[Any]]
    ) -> Callable[[], Awaitable[Any]]:
        tier = self.bundle.agents[agent_name].model_tier

        async def run() -> Any:
            # The runtime is resolved when the task starts, so a model switched in the meantime is honoured.
            with use_llm(self.models.runtime(tier)), use_meter(self.meter):
                return await fn()

        return run

    def _ctx(self, node: NodeSpec, agent_name: str) -> SkillCtx:
        def make_task(
            task_id: str,
            group: str,
            fn: Callable[[], Awaitable[Any]],
            *,
            label: str,
            pool: str,
            essential: bool,
        ) -> Task:
            return Task(
                id=task_id,
                group=group,
                run=self._wrap(repair_agent, fn),
                label=label,
                pool=pool,
                essential=essential,
                retries=1,
            )

        repair_node = (
            next((n for n in self.bundle.workflow.nodes if n.id == node.on_fail), None)
            if node.on_fail
            else None
        )
        repair_agent = (
            repair_node.agent if repair_node and repair_node.agent else agent_name
        ) or agent_name

        def make_group(group_id: str, *, tasks: list[Task]) -> Group:
            return Group(id=group_id, tasks=tasks, expanded=True, essential=False)

        return SkillCtx(
            bundle=self.bundle,
            node=node,
            agent=self.bundle.agents[agent_name],
            state=self.state,
            builder=self.builder,
            emit=self.emit,
            run_group=self.sched.run_group,
            budget_used=self.budget.used_fraction,
            make_task=make_task,
            make_group=make_group,
        )

    def _task(self, node: NodeSpec, agent_name: str, task_id: str, label: str, item: Any) -> Task:
        ctx = self._ctx(node, agent_name)

        async def work() -> Any:
            if node.kind == "gate":
                repair = next((n for n in self.bundle.workflow.nodes if n.id == node.on_fail), None)
                repair_agent = self.bundle.agents[repair.agent] if repair and repair.agent else None
                rounds = min(node.max_rounds, self.bundle.workflow.policy.max_repair_rounds)
                return await run_gate(ctx, repair_agent, rounds)
            return await SKILLS[ctx.agent.skill](ctx, item)

        return Task(
            id=task_id,
            group=node.id,
            run=self._wrap(agent_name, work),
            label=label,
            priority=node.priority,
            pool=node.pool,
            essential=node.essential,
            # A gate runs the repair loop inside itself: it must not be retried (side effects), and its time limit
            # is the run's budget, not a single task's.
            retries=0 if node.kind == "gate" else node.retries,
            timeout=float(max(node.timeout_seconds, self.bundle.workflow.policy.max_seconds))
            if node.kind == "gate"
            else float(node.timeout_seconds),
        )

    def _group(self, node: NodeSpec) -> Group:
        bundle = self.bundle
        agent_name = node.agent or bundle.team.supervisor or bundle.team.members[0]
        if node.kind == "map":
            map_over = node.map_over or ""

            async def expand_map() -> list[Task]:
                items = expand_items(self.state, map_over)
                tasks = [
                    self._task(
                        node, agent_name, f"{node.id}#{i}", item_label(self.state, map_over, it), it
                    )
                    for i, it in enumerate(items)
                ]
                if node.pipeline:
                    for i, task in enumerate(tasks):
                        task.needs = [f"{dep}#{i}" for dep in node.depends_on]
                return tasks

            return Group(
                id=node.id,
                deps=list(node.depends_on),
                pipelined=list(node.depends_on) if node.pipeline else [],
                expand=expand_map,
                priority=node.priority,
                essential=node.essential,
            )

        label = {"gate": "质量门：独立核查结果是否达标", "merge": "统稿与披露"}.get(
            node.kind, bundle.agents[agent_name].role
        )

        async def expand_one() -> list[Task]:
            return [self._task(node, agent_name, node.id, label, None)]

        return Group(
            id=node.id,
            deps=list(node.depends_on),
            expand=expand_one,
            priority=node.priority,
            essential=node.essential,
        )

    # ---- running -------------------------------------------------------------------------------------

    async def execute(self) -> Outcome:
        for node in self.bundle.workflow.nodes:
            if node.kind != "loop":  # a loop node is triggered by the gate that names it in on_fail
                self.sched.add_group(self._group(node))
        try:
            await self.sched.run()
        finally:
            if self.state.corpus is not None:
                try:
                    await self.state.corpus.close()
                except Exception:
                    logger.warning("orchestration_corpus_cleanup_failed", exc_info=True)

        tasks = [t for g in self.sched.groups.values() for t in g.tasks]
        bad = next((t for t in tasks if t.status == "failed" and t.essential), None)
        error = (
            _readable_error(bad) if bad else (None if self.state.result else "工作流没有产出结果")
        )
        wall = round(time.monotonic() - self._t0, 2)
        busy = sum(
            (t.ended_at or 0) - (t.started_at or 0) for t in tasks if t.started_at and t.ended_at
        )
        metrics = {
            "wall_seconds": wall,
            "busy_seconds": round(busy, 2),
            "parallel_speedup": round(busy / wall, 2) if wall else 1.0,
            "tasks": len(tasks),
            "tasks_failed": sum(t.status == "failed" for t in tasks),
            "tasks_skipped": sum(t.status == "skipped" for t in tasks),
            "tokens": self.meter.total_tokens,
            "llm_calls": self.meter.calls,
            "repair_rounds": len(self.state.repairs),
            "repairs": self.state.repairs,
            "verifier_downgrades": self.state.overturned,
            "model": self.models.current,
            "model_switches": self.models.switches,
        }
        return Outcome(
            status="failed" if error else "done",
            result=self.state.result,
            metrics=metrics,
            error=error,
            events=self.events,
        )


def _readable_error(task: Task) -> str:
    raw = task.error or "未知错误"
    if "insufficient_quota" in raw or "Free quota" in raw:
        return "模型额度已用尽（接口返回 403），请到模型服务商控制台充值或更换模型"
    if "WebSearchError" in raw or "没有搜到" in raw or "网页搜索" in raw:
        return "网页搜索暂时不可用或没有搜到可读取的网页，请稍后再试"
    return f"{task.label or task.id} 失败：{raw[:200]}"


__all__ = ["NullStore", "OrchestrationEngine", "Outcome", "RunStore", "asyncio"]
