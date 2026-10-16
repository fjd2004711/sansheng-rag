"""Research reports: queue a background build, follow its progress, export Word / PDF."""

import re
from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import BadRequestError, NotFoundError, RateLimitError
from app.db.models.research_report import ResearchReport
from app.repositories import research_report as report_repo
from app.schemas.research_report import ResearchReportCreate
from app.services.research import ReportDocument, render_docx, render_pdf

ExportFormat = Literal["docx", "pdf"]
_MEDIA_TYPES = {
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pdf": "application/pdf",
}
STALE_MESSAGE = "生成中断（服务重启或超时），请重新生成"


class ResearchReportService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, user_id: UUID, data: ResearchReportCreate) -> ResearchReport:
        if await report_repo.count_active(self.db, user_id=user_id) > 0:
            await self._expire_stale(user_id)
            if await report_repo.count_active(self.db, user_id=user_id) > 0:
                raise RateLimitError(message="已有一份报告正在生成，请等它完成后再开始新的报告")
        since = datetime.now(UTC) - timedelta(days=1)
        if (
            await report_repo.count_since(self.db, user_id=user_id, since=since)
            >= settings.REPORT_MAX_PER_DAY
        ):
            raise RateLimitError(
                message=f"每天最多生成 {settings.REPORT_MAX_PER_DAY} 份报告，请明天再试",
                details={"limit": settings.REPORT_MAX_PER_DAY},
            )
        return await report_repo.create(self.db, user_id=user_id, topic=data.topic)

    async def list(
        self, user_id: UUID, *, skip: int, limit: int
    ) -> tuple[list[ResearchReport], int]:
        await self._expire_stale(user_id)
        return await report_repo.list_by_user(self.db, user_id=user_id, skip=skip, limit=limit)

    async def get(self, user_id: UUID, report_id: UUID) -> ResearchReport:
        report = await report_repo.get_by_id(self.db, report_id)
        if report is None or report.user_id != user_id:
            raise NotFoundError(message="报告不存在", details={"report_id": str(report_id)})
        if _is_stale(report):
            report = await report_repo.update(
                self.db, db_report=report, update_data={"status": "failed", "error": STALE_MESSAGE}
            )
        return report

    async def delete(self, user_id: UUID, report_id: UUID) -> None:
        await self.get(user_id, report_id)
        await report_repo.delete(self.db, report_id)

    async def export(
        self, user_id: UUID, report_id: UUID, fmt: ExportFormat
    ) -> tuple[bytes, str, str]:
        """(content, filename, media type) of a finished report."""
        report = await self.get(user_id, report_id)
        if report.status != "done" or not report.report:
            raise BadRequestError(message="报告还没有生成完成", details={"status": report.status})
        document = ReportDocument.model_validate(report.report)
        content = render_docx(document) if fmt == "docx" else render_pdf(document)
        return content, f"{_safe_filename(document.title)}.{fmt}", _MEDIA_TYPES[fmt]

    # ---- used by the background job -------------------------------------------------------------

    async def exists(self, report_id: UUID) -> bool:
        return await report_repo.get_by_id(self.db, report_id) is not None

    async def mark_progress(self, report_id: UUID, stage: str, progress: int) -> None:
        report = await report_repo.get_by_id(self.db, report_id)
        if report is not None:
            await report_repo.update(
                self.db,
                db_report=report,
                update_data={
                    "status": "running",
                    "stage": stage[:200],
                    "progress": max(0, min(progress, 99)),
                },
            )

    async def complete(self, report_id: UUID, document: ReportDocument) -> None:
        report = await report_repo.get_by_id(self.db, report_id)
        if report is not None:
            await report_repo.update(
                self.db,
                db_report=report,
                update_data={
                    "status": "done",
                    "stage": "已完成",
                    "progress": 100,
                    "title": document.title[:300],
                    "report": document.model_dump(mode="json"),
                    "error": None,
                },
            )

    async def fail(self, report_id: UUID, message: str) -> None:
        report = await report_repo.get_by_id(self.db, report_id)
        if report is not None:
            await report_repo.update(
                self.db, db_report=report, update_data={"status": "failed", "error": message[:2000]}
            )

    async def _expire_stale(self, user_id: UUID) -> None:
        items, _ = await report_repo.list_by_user(self.db, user_id=user_id, skip=0, limit=20)
        for report in items:
            if _is_stale(report):
                await report_repo.update(
                    self.db,
                    db_report=report,
                    update_data={"status": "failed", "error": STALE_MESSAGE},
                )


def _is_stale(report: ResearchReport) -> bool:
    """A queued/running report nobody has touched for a while: its background task is gone."""
    if report.status not in ("queued", "running"):
        return False
    touched = report.updated_at or report.created_at
    return touched is not None and datetime.now(UTC) - touched > timedelta(
        minutes=settings.REPORT_STALE_AFTER_MINUTES
    )


def _safe_filename(title: str) -> str:
    return re.sub(r'[\\/:*?"<>|\s]+', "_", title).strip("_")[:80] or "调研报告"
