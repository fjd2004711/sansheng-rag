"""Build one research report in the API process and record its progress on the DB row."""

import asyncio
import logging
from uuid import UUID

from app.core.exceptions import AppException
from app.core.llm_runtime import use_llm
from app.core.usage_meter import UsageMeter, use_meter
from app.db.session import get_db_context
from app.services.llm_config import load_runtime
from app.services.research import ReportBuilder, ResearchService
from app.services.research_report import ResearchReportService
from app.services.usage import UsageService

logger = logging.getLogger(__name__)


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


async def generate_report_in_background(*, report_id: UUID, user_id: UUID, topic: str) -> None:
    if not await _wait_for_row(report_id):
        logger.error("report_row_never_committed report=%s", report_id)
        return
    async with get_db_context() as db:
        runtime = await load_runtime(db, user_id)

    async def progress(stage: str, percent: int) -> None:
        async with get_db_context() as db:
            await ResearchReportService(db).mark_progress(report_id, stage, percent)

    meter = UsageMeter()
    try:
        with use_llm(runtime), use_meter(meter):
            await progress("准备开始", 1)
            document = await ReportBuilder(ResearchService.from_settings()).build(topic, progress)
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
    finally:
        try:
            async with get_db_context() as db:
                await UsageService(db).record(
                    user_id=user_id, meter=meter, runtime=runtime, kind="report"
                )
        except Exception:
            logger.warning("report_usage_record_failed", exc_info=True)
