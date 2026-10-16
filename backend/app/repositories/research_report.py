"""Research report repository (PostgreSQL async)."""

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.research_report import ResearchReport


async def get_by_id(db: AsyncSession, report_id: UUID) -> ResearchReport | None:
    return await db.get(ResearchReport, report_id)


async def create(db: AsyncSession, *, user_id: UUID, topic: str) -> ResearchReport:
    report = ResearchReport(
        user_id=user_id, topic=topic, status="queued", stage="排队中", progress=0
    )
    db.add(report)
    await db.flush()
    await db.refresh(report)
    return report


async def list_by_user(
    db: AsyncSession, *, user_id: UUID, skip: int, limit: int
) -> tuple[list[ResearchReport], int]:
    total = await db.scalar(
        select(func.count()).select_from(ResearchReport).where(ResearchReport.user_id == user_id)
    )
    result = await db.execute(
        select(ResearchReport)
        .where(ResearchReport.user_id == user_id)
        .order_by(ResearchReport.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return list(result.scalars().all()), int(total or 0)


async def count_active(db: AsyncSession, *, user_id: UUID) -> int:
    return int(
        await db.scalar(
            select(func.count())
            .select_from(ResearchReport)
            .where(
                ResearchReport.user_id == user_id, ResearchReport.status.in_(("queued", "running"))
            )
        )
        or 0
    )


async def count_since(db: AsyncSession, *, user_id: UUID, since: datetime) -> int:
    return int(
        await db.scalar(
            select(func.count())
            .select_from(ResearchReport)
            .where(ResearchReport.user_id == user_id, ResearchReport.created_at >= since)
        )
        or 0
    )


async def update(
    db: AsyncSession, *, db_report: ResearchReport, update_data: dict[str, Any]
) -> ResearchReport:
    for field, value in update_data.items():
        setattr(db_report, field, value)
    await db.flush()
    await db.refresh(db_report)
    return db_report


async def delete(db: AsyncSession, report_id: UUID) -> ResearchReport | None:
    report = await get_by_id(db, report_id)
    if report:
        await db.delete(report)
        await db.flush()
    return report
