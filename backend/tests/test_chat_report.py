"""Report mode in the chat: a dropped connection must not leave the report 'running'."""

import asyncio
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.services.agent_session import AgentSession


@pytest.mark.anyio
async def test_cancelled_turn_marks_the_report_failed_and_reraises() -> None:
    report_id = uuid4()
    service = MagicMock()
    service.create = AsyncMock(return_value=MagicMock(id=report_id))
    service.fail = AsyncMock()

    @asynccontextmanager
    async def fake_db():
        yield MagicMock()

    session = AgentSession(MagicMock(), MagicMock(id=uuid4()))
    builder = MagicMock()
    builder.build = AsyncMock(side_effect=asyncio.CancelledError())
    with (
        patch("app.services.agent_session.get_db_context", fake_db),
        patch("app.services.agent_session.ResearchReportService", return_value=service),
        patch("app.services.agent_session.ReportBuilder", return_value=builder),
        patch("app.services.agent_session.ResearchService"),
        patch("app.services.agent_session.send_event", AsyncMock()),
        pytest.raises(asyncio.CancelledError),
    ):
        await session._run_report("2025届大学生就业", [])

    service.fail.assert_awaited_once()
    assert service.fail.await_args.args[0] == report_id
    assert "中止" in service.fail.await_args.args[1]
