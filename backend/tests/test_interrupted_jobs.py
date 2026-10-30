from contextlib import asynccontextmanager
from types import SimpleNamespace
from typing import Any

import pytest

from app import main
from app.repositories import orchestration as orch_repo
from app.repositories import research_report as report_repo


class _FakeDB:
    def __init__(self, rowcount: int) -> None:
        self.statements: list[str] = []
        self._rowcount = rowcount

    async def execute(self, statement: Any) -> Any:
        self.statements.append(str(statement.compile(compile_kwargs={"literal_binds": True})))
        return SimpleNamespace(rowcount=self._rowcount)


@pytest.mark.anyio
async def test_fail_active_only_touches_queued_and_running_runs() -> None:
    db = _FakeDB(2)
    assert await orch_repo.fail_active(db, error="x") == 2  # ty: ignore[invalid-argument-type]
    sql = db.statements[0]
    assert "UPDATE orch_runs" in sql
    assert "'queued'" in sql and "'running'" in sql
    assert "'done'" not in sql


@pytest.mark.anyio
async def test_fail_active_reports_covers_research_reports() -> None:
    db = _FakeDB(1)
    assert await report_repo.fail_active(db, error="x") == 1  # ty: ignore[invalid-argument-type]
    assert "UPDATE research_reports" in db.statements[0]


@pytest.mark.anyio
async def test_startup_marks_interrupted_jobs_and_survives_database_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = _FakeDB(3)

    @asynccontextmanager
    async def fake_context():
        yield db

    monkeypatch.setattr(main, "get_db_context", fake_context)
    await main._fail_interrupted_jobs()
    assert len(db.statements) == 2

    @asynccontextmanager
    async def broken_context():
        raise RuntimeError("db down")
        yield

    monkeypatch.setattr(main, "get_db_context", broken_context)
    await main._fail_interrupted_jobs()  # must not stop the app from starting
