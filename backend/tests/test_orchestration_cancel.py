import asyncio
from contextlib import asynccontextmanager
from types import SimpleNamespace
from typing import Any
from uuid import uuid4

import pytest

from app.services.orchestration import registry
from app.worker.background import orchestration as job


class _FakeService:
    finished: dict[str, Any] = {}

    def __init__(self, db: Any) -> None:
        pass

    async def exists(self, run_id: Any) -> bool:
        return True

    async def mark_running(self, run_id: Any) -> Any:
        return SimpleNamespace(bundle={}, topic="t", run_input={})

    async def finish(
        self, run_id: Any, *, status: str, result: Any, metrics: Any, error: Any
    ) -> None:
        type(self).finished = {"status": status, "error": error}


@pytest.fixture
def fake_job(monkeypatch: pytest.MonkeyPatch) -> type[_FakeService]:
    @asynccontextmanager
    async def fake_db():
        yield object()

    async def fake_runtime(db: Any, user_id: Any) -> Any:
        return SimpleNamespace(model="m")

    _FakeService.finished = {}
    monkeypatch.setattr(job, "get_db_context", fake_db)
    monkeypatch.setattr(job, "OrchestrationService", _FakeService)
    monkeypatch.setattr(job, "load_runtime", fake_runtime)
    monkeypatch.setattr(job.Bundle, "model_validate", staticmethod(lambda data: data))
    monkeypatch.setattr(job, "DbRunStore", lambda: object())
    return _FakeService


@pytest.mark.anyio
async def test_run_with_missing_search_service_is_marked_failed_not_left_running(
    fake_job: type[_FakeService], monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.services.research.exceptions import ResearchNotConfiguredError

    def broken() -> Any:
        raise ResearchNotConfiguredError(message="没有配置搜索服务")

    monkeypatch.setattr(job.ResearchService, "from_settings", staticmethod(broken))
    await job.execute_run_in_background(run_id=uuid4(), user_id=uuid4())
    assert fake_job.finished == {"status": "failed", "error": "没有配置搜索服务"}


@pytest.mark.anyio
async def test_cancelled_run_records_the_user_cancellation(
    fake_job: type[_FakeService], monkeypatch: pytest.MonkeyPatch
) -> None:
    started = asyncio.Event()

    class _Engine:
        def __init__(self, **kwargs: Any) -> None:
            pass

        async def execute(self, *args: Any, **kwargs: Any) -> Any:
            started.set()
            await asyncio.sleep(60)

    monkeypatch.setattr(job.ResearchService, "from_settings", staticmethod(lambda: object()))
    monkeypatch.setattr(job, "OrchestrationEngine", _Engine)
    run_id = uuid4()
    task = asyncio.create_task(job.execute_run_in_background(run_id=run_id, user_id=uuid4()))
    await started.wait()
    assert registry.cancel(run_id) is True
    await task
    assert fake_job.finished == {"status": "failed", "error": registry.CANCELLED_MESSAGE}


def test_cancel_unknown_run_returns_false() -> None:
    assert registry.cancel(uuid4()) is False
