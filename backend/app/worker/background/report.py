"""Build one research report in the API process and record its progress on the DB row."""

import asyncio
import logging
from uuid import UUID

from app.core.exceptions import AppException, ExternalServiceError
from app.db.session import get_db_context
from app.schemas.orchestration import RunCreate
from app.services.orchestration.facade import OrchestrationService
from app.services.research import ReportDocument
from app.services.research_report import ResearchReportService
from app.worker.background.orchestration import execute_run_in_background

logger = logging.getLogger(__name__)


_MIRROR_SECONDS = 3.0
_ROW_WAIT_TRIES = 50
_ROW_WAIT_SECONDS = 0.2


async def _wait_for_row(report_id: UUID) -> bool:
    """The request that queued the report commits after the job starts; wait for its row to appear."""
    for _ in range(_ROW_WAIT_TRIES):
        async with get_db_context() as db:
            if await ResearchReportService(db).exists(report_id):
                return True
        await asyncio.sleep(_ROW_WAIT_SECONDS)
    return False


async def _build_through_orchestration(
    report_id: UUID, user_id: UUID, topic: str
) -> ReportDocument:
    """Run the report as an orchestration run: the same engine, so it shows live on the orchestration page.

    The report row mirrors the run's progress; the run's result is the report.
    """
    async with get_db_context() as db:
        run = await OrchestrationService(db).create_run(
            user_id, RunCreate(spec="verified-report", topic=topic)
        )
        run_id = run.id
    job = asyncio.ensure_future(execute_run_in_background(run_id=run_id, user_id=user_id))
    try:
        while not job.done():
            await asyncio.wait({job}, timeout=_MIRROR_SECONDS)
            async with get_db_context() as db:
                current = await OrchestrationService(db).get_run(user_id, run_id)
                if current.status in ("queued", "running"):
                    await ResearchReportService(db).mark_progress(
                        report_id, current.stage or "准备开始", max(1, current.progress)
                    )
        await job
    except BaseException:
        job.cancel()
        raise
    async with get_db_context() as db:
        final = await OrchestrationService(db).get_run(user_id, run_id)
    if final.status != "done" or not final.result or final.result.get("kind") != "report":
        raise ExternalServiceError(message=final.error or "报告生成失败")
    return ReportDocument.model_validate(final.result["report"])


async def generate_report_in_background(*, report_id: UUID, user_id: UUID, topic: str) -> None:
    if not await _wait_for_row(report_id):
        logger.error("report_row_never_committed report=%s", report_id)
        return
    # Token usage is recorded by the orchestration run itself.
    try:
        document = await _build_through_orchestration(report_id, user_id, topic)
        async with get_db_context() as db:
            await ResearchReportService(db).complete(report_id, document)
    except AppException as exc:
        logger.warning("report_generation_failed report=%s error=%s", report_id, exc.message)
        async with get_db_context() as db:
            await ResearchReportService(db).fail(report_id, exc.message)
    except Exception as exc:
        logger.exception("report_generation_crashed report=%s", report_id)
        async with get_db_context() as db:
            await ResearchReportService(db).fail(report_id, f"生成失败：{type(exc).__name__}")
