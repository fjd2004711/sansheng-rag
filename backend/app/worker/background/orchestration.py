"""Execute one orchestration run in the API process and record its outcome on the DB row."""

import asyncio
import logging
from uuid import UUID

from app.core.exceptions import AppException
from app.db.session import get_db_context
from app.services.llm_config import load_runtime
from app.services.orchestration import registry
from app.services.orchestration.engine import OrchestrationEngine
from app.services.orchestration.facade import OrchestrationService
from app.services.orchestration.spec import Bundle
from app.services.orchestration.store import DbRunStore
from app.services.research import ResearchService
from app.services.usage import UsageService

logger = logging.getLogger(__name__)

_ROW_WAIT_TRIES = 50
_ROW_WAIT_SECONDS = 0.2


async def _wait_for_row(run_id: UUID) -> bool:
    """The request that queued the run commits after this job starts; wait for its row to appear."""
    for _ in range(_ROW_WAIT_TRIES):
        async with get_db_context() as db:
            if await OrchestrationService(db).exists(run_id):
                return True
        await asyncio.sleep(_ROW_WAIT_SECONDS)
    return False


async def execute_run_in_background(*, run_id: UUID, user_id: UUID) -> None:
    if not await _wait_for_row(run_id):
        logger.error("orch_row_never_committed run=%s", run_id)
        return
    async with get_db_context() as db:
        service = OrchestrationService(db)
        run = await service.mark_running(run_id)
        runtime = await load_runtime(db, user_id)
        assert run is not None
        bundle = Bundle.model_validate(run.bundle)
        topic, run_input = run.topic, dict(run.run_input)

    status, result, metrics, error = "failed", None, None, None
    registry.register(run_id)
    try:
        # Built inside the try: a missing search service must fail this run, not leave it "running".
        engine = OrchestrationEngine(research=ResearchService.from_settings(), store=DbRunStore())
        outcome = await engine.execute(
            bundle, topic=topic, run_input=run_input, run_id=run_id, runtime=runtime
        )
        status, result, metrics, error = (
            outcome.status,
            outcome.result,
            outcome.metrics,
            outcome.error,
        )
    except AppException as exc:
        logger.warning("orch_run_failed run=%s error=%s", run_id, exc.message)
        error = exc.message
    except asyncio.CancelledError:
        by_user = registry.release(run_id)
        error = registry.CANCELLED_MESSAGE if by_user else "运行被取消（服务重启）"
        if not by_user:
            raise
    except Exception as exc:
        logger.exception("orch_run_crashed run=%s", run_id)
        error = f"运行失败：{type(exc).__name__}"
    finally:
        registry.release(run_id)
        try:
            async with get_db_context() as db:
                await OrchestrationService(db).finish(
                    run_id, status=status, result=result, metrics=metrics, error=error
                )
        except Exception:
            logger.exception("orch_run_finish_write_failed run=%s", run_id)
        if metrics:
            try:
                from app.core.usage_meter import UsageMeter

                meter = UsageMeter()
                meter.add(metrics.get("tokens", 0), 0)
                async with get_db_context() as db:
                    await UsageService(db).record(
                        user_id=user_id, meter=meter, runtime=runtime, kind="orchestration"
                    )
            except Exception:
                logger.warning("orch_usage_record_failed", exc_info=True)
