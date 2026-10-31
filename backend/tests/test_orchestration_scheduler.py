"""The scheduler runs a dependency graph with pools, retries, budgets and tasks inserted while it runs."""

import asyncio
import time

import pytest

from app.services.orchestration.scheduler import Group, Scheduler, Task


class Events:
    def __init__(self) -> None:
        self.items: list[tuple[str, dict]] = []

    async def __call__(self, kind: str, detail: dict) -> None:
        self.items.append((kind, detail))

    def kinds(self, kind: str) -> list[dict]:
        return [d for k, d in self.items if k == kind]


def _task(id: str, group: str, fn, **kw) -> Task:
    return Task(id=id, group=group, run=fn, **kw)


def _sched(events: Events, **kw) -> Scheduler:
    return Scheduler(
        pools=kw.pop("pools", {"llm": 4, "search": 2}), emit=events, retry_delay=0, **kw
    )


@pytest.mark.anyio
async def test_map_group_fans_out_in_parallel_after_its_dependency() -> None:
    events, order = Events(), []
    s = _sched(events)

    async def plan() -> list[str]:
        order.append("plan")
        return ["a", "b", "c"]

    plan_task = _task("plan", "plan", plan)
    s.add_group(Group(id="plan", tasks=[plan_task], expanded=True))

    async def expand() -> list[Task]:
        async def work(name: str) -> str:
            order.append(f"start {name}")
            await asyncio.sleep(0.2)
            return name

        return [
            _task(f"sections#{n}", "sections", (lambda n=n: work(n)), pool="llm")
            for n in plan_task.result
        ]

    s.add_group(Group(id="sections", deps=["plan"], expand=expand))
    started = time.monotonic()
    await s.run()
    assert order[0] == "plan" and sorted(order[1:]) == ["start a", "start b", "start c"]
    assert time.monotonic() - started < 0.5  # three 0.2s tasks ran side by side, not back to back
    assert s.groups["sections"].ok


@pytest.mark.anyio
async def test_pool_limits_concurrency() -> None:
    events, active, peak = Events(), 0, 0
    s = _sched(events, pools={"search": 2})

    async def work() -> None:
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0.05)
        active -= 1

    s.add_group(
        Group(
            id="g",
            tasks=[_task(f"t{i}", "g", work, pool="search") for i in range(6)],
            expanded=True,
        )
    )
    await s.run()
    assert peak == 2 and s.groups["g"].ok


@pytest.mark.anyio
async def test_failed_task_retries_then_succeeds_and_failure_blocks_downstream() -> None:
    events, calls = Events(), {"n": 0}
    s = _sched(events)

    async def flaky() -> str:
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("boom")
        return "ok"

    async def bad() -> None:
        raise RuntimeError("always")

    s.add_group(Group(id="flaky", tasks=[_task("flaky", "flaky", flaky, retries=1)], expanded=True))
    s.add_group(Group(id="bad", tasks=[_task("bad", "bad", bad, retries=1)], expanded=True))
    s.add_group(Group(id="after_bad", deps=["bad"], tasks=[_task("after", "after_bad", flaky)]))
    await s.run()
    assert s.groups["flaky"].ok and calls["n"] == 2
    assert s.groups["bad"].tasks[0].status == "failed"
    assert s.groups["after_bad"].tasks[0].status == "skipped"
    assert len(events.kinds("task_retry")) >= 1


@pytest.mark.anyio
async def test_running_task_can_insert_a_group_and_wait_for_it() -> None:
    events, ran = Events(), []
    s = _sched(events)

    async def gate() -> str:
        async def repair() -> None:
            ran.append("repair")

        ok = await s.run_group(
            Group(id="repair#r1", tasks=[_task("repair#r1", "repair#r1", repair)], expanded=True)
        )
        ran.append(f"gate saw repair ok={ok}")
        return "gated"

    s.add_group(Group(id="gate", tasks=[_task("gate", "gate", gate)], expanded=True))
    await s.run()
    assert ran == ["repair", "gate saw repair ok=True"]


@pytest.mark.anyio
async def test_non_essential_tasks_are_dropped_when_budget_is_gone() -> None:
    events, ran = Events(), []
    s = _sched(events, budget_ok=lambda: False)

    async def work() -> None:
        ran.append(1)

    s.add_group(
        Group(
            id="g",
            expanded=True,
            tasks=[_task("must", "g", work), _task("nice", "g", work, essential=False)],
        )
    )
    await s.run()
    assert ran == [1]
    assert {t.id: t.status for t in s.groups["g"].tasks} == {"must": "done", "nice": "skipped"}
    assert s.groups["g"].ok  # a skipped optional task does not fail the group


@pytest.mark.anyio
async def test_model_error_triggers_fallback_without_spending_an_attempt() -> None:
    events, models = Events(), ["primary", "backup"]
    used = []

    async def on_model_error(exc: BaseException) -> bool:
        if "quota" in str(exc) and len(models) > 1:
            models.pop(0)
            return True
        return False

    s = Scheduler(pools={}, emit=events, on_model_error=on_model_error, retry_delay=0)

    async def call() -> str:
        used.append(models[0])
        if models[0] == "primary":
            raise RuntimeError("403 quota exhausted")
        return "answer"

    s.add_group(Group(id="g", tasks=[_task("call", "g", call, retries=0)], expanded=True))
    await s.run()
    assert used == ["primary", "backup"] and s.groups["g"].ok
    assert events.kinds("task_retry")[0]["reason"] == "model_fallback"


@pytest.mark.anyio
async def test_pipelined_group_starts_each_item_when_its_own_upstream_item_is_done() -> None:
    events, log = Events(), []
    s = _sched(events)

    def make(name: str, group: str, delay: float, needs: list[str] | None = None) -> Task:
        async def work() -> None:
            await asyncio.sleep(delay)
            log.append(name)

        return _task(name, group, work, pool="llm", needs=needs or [])

    async def expand_up() -> list[Task]:
        return [make("up#0", "up", 0.05), make("up#1", "up", 0.4)]

    async def expand_down() -> list[Task]:
        return [make("down#0", "down", 0.05, ["up#0"]), make("down#1", "down", 0.05, ["up#1"])]

    s.add_group(Group(id="up", expand=expand_up))
    s.add_group(Group(id="down", deps=["up"], pipelined=["up"], expand=expand_down))
    await s.run()
    assert log == ["up#0", "down#0", "up#1", "down#1"]  # down#0 did not wait for the slow up#1
    assert s.groups["down"].ok


@pytest.mark.anyio
async def test_pipelined_item_is_skipped_when_its_upstream_item_fails() -> None:
    events = Events()
    s = _sched(events)

    async def boom() -> None:
        raise RuntimeError("x")

    async def fine() -> None:
        return None

    async def expand_up() -> list[Task]:
        return [_task("up#0", "up", boom, retries=0), _task("up#1", "up", fine)]

    async def expand_down() -> list[Task]:
        return [
            _task("down#0", "down", fine, needs=["up#0"]),
            _task("down#1", "down", fine, needs=["up#1"]),
        ]

    s.add_group(Group(id="up", expand=expand_up))
    s.add_group(Group(id="down", deps=["up"], pipelined=["up"], expand=expand_down))
    await s.run()
    statuses = {t.id: t.status for t in s.groups["down"].tasks}
    assert statuses == {"down#0": "failed", "down#1": "done"}
    assert not s.groups["down"].ok
