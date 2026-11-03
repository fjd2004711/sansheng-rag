"""The 调研报告 module builds its report through the orchestration engine (so it shows live on the orchestration
page), and deleting a run that is still going stops it."""

from contextlib import asynccontextmanager
from types import SimpleNamespace
from typing import Any
from uuid import uuid4

import pytest

from app.services.orchestration import facade, registry
from app.worker.background import report as job


class _Orch:
    final: Any = None

    def __init__(self, db: Any) -> None:
        pass

    async def create_run(self, user_id: Any, data: Any) -> Any:
        type(self).created = data
        return SimpleNamespace(id=uuid4())

    async def get_run(self, user_id: Any, run_id: Any) -> Any:
        return type(self).final


class _Reports:
    done: Any = None
    failed: Any = None

    def __init__(self, db: Any) -> None:
        pass

    async def mark_progress(self, *a: Any) -> None:
        pass

    async def complete(self, report_id: Any, document: Any) -> None:
        type(self).done = document

    async def fail(self, report_id: Any, message: str) -> None:
        type(self).failed = message


@pytest.fixture
def wired(monkeypatch: pytest.MonkeyPatch) -> None:
    @asynccontextmanager
    async def fake_db():
        yield object()

    async def fake_exec(*, run_id: Any, user_id: Any) -> None:
        return None

    _Reports.done = _Reports.failed = None
    monkeypatch.setattr(job, "get_db_context", fake_db)
    monkeypatch.setattr(job, "OrchestrationService", _Orch)
    monkeypatch.setattr(job, "ResearchReportService", _Reports)
    monkeypatch.setattr(job, "execute_run_in_background", fake_exec)


async def _build(wired: None) -> None:
    await job._build_through_orchestration(uuid4(), uuid4(), "主题")


@pytest.mark.anyio
async def test_report_job_runs_the_verified_report_workflow_and_returns_its_document(
    wired: None,
) -> None:
    from tests.test_research_report import _report

    document = _report().model_dump(mode="json")
    _Orch.final = SimpleNamespace(
        status="done", result={"kind": "report", "report": document}, error=None
    )
    result = await job._build_through_orchestration(uuid4(), uuid4(), "主题")
    assert result.title == _report().title
    assert _Orch.created.spec == "verified-report"


@pytest.mark.anyio
async def test_report_job_failed_run_raises_its_error(wired: None) -> None:
    from app.core.exceptions import AppException

    _Orch.final = SimpleNamespace(status="failed", result=None, error="搜索失败")
    with pytest.raises(AppException) as info:
        await job._build_through_orchestration(uuid4(), uuid4(), "主题")
    assert info.value.message == "搜索失败"


@pytest.mark.anyio
async def test_deleting_an_active_run_cancels_it_first(monkeypatch: pytest.MonkeyPatch) -> None:
    run_id, cancelled, deleted = uuid4(), [], []

    async def get_run(self: Any, user_id: Any, rid: Any) -> Any:
        return SimpleNamespace(status="running")

    async def delete_run(db: Any, rid: Any) -> None:
        deleted.append(rid)

    monkeypatch.setattr(facade.OrchestrationService, "get_run", get_run)
    monkeypatch.setattr(facade.repo, "delete_run", delete_run)
    monkeypatch.setattr(registry, "cancel", lambda rid: cancelled.append(rid) or True)
    await facade.OrchestrationService(object()).delete_run(uuid4(), run_id)  # type: ignore[arg-type]
    assert cancelled == [run_id] and deleted == [run_id]
