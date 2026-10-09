"""Per-user token usage: recording a turn's spend and reading it back."""

import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.llm_runtime import LLMRuntime, server_default_llm
from app.core.usage_meter import UsageMeter
from app.repositories import token_usage_repo
from app.schemas.usage import (
    AdminUsage,
    AdminUsageRow,
    UsageBySource,
    UsageDay,
    UsageSummary,
    UsageTotals,
)

logger = logging.getLogger(__name__)


class UsageService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def record(
        self,
        *,
        user_id: UUID,
        meter: UsageMeter,
        runtime: LLMRuntime | None,
        kind: str,
        conversation_id: str | None = None,
        message_id: str | None = None,
    ) -> None:
        """Store one meter. Nothing is stored when the provider reported no usage at all."""
        if meter.calls == 0 or meter.total_tokens == 0:
            return
        llm = runtime or server_default_llm()
        await token_usage_repo.create(
            self.db,
            user_id=user_id,
            conversation_id=UUID(conversation_id) if conversation_id else None,
            message_id=UUID(message_id) if message_id else None,
            kind=kind,
            source="custom" if runtime is not None and runtime.is_custom else "server",
            model=llm.model,
            prompt_tokens=meter.prompt_tokens,
            completion_tokens=meter.completion_tokens,
            calls=meter.calls,
        )

    async def summary(self, user_id: UUID, *, days: int) -> UsageSummary:
        now = datetime.now(UTC)
        since = now - timedelta(days=days)
        start_today = now.replace(hour=0, minute=0, second=0, microsecond=0)

        async def totals(start: datetime) -> UsageTotals:
            prompt, completion, total, turns = await token_usage_repo.totals_for_user(
                self.db, user_id, start
            )
            return UsageTotals(
                prompt_tokens=prompt, completion_tokens=completion, total_tokens=total, turns=turns
            )

        return UsageSummary(
            days=days,
            totals=await totals(since),
            today=await totals(start_today),
            by_day=[
                UsageDay(day=d, total_tokens=t)
                for d, t in await token_usage_repo.by_day_for_user(self.db, user_id, since)
            ],
            by_source=[
                UsageBySource(source=s, model=m, total_tokens=t)
                for s, m, t in await token_usage_repo.by_source_for_user(self.db, user_id, since)
            ],
        )

    async def admin_overview(self, *, days: int) -> AdminUsage:
        since = datetime.now(UTC) - timedelta(days=days)
        rows = await token_usage_repo.totals_by_user(self.db, since)
        return AdminUsage(
            days=days,
            items=[
                AdminUsageRow(
                    email=email,
                    source=source,
                    prompt_tokens=prompt,
                    completion_tokens=completion,
                    total_tokens=prompt + completion,
                    records=records,
                )
                for email, source, prompt, completion, records in rows
            ],
        )
