"""Orchestration repository (PostgreSQL async)."""

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.orchestration import OrchEvent, OrchFeedback, OrchRun, OrchSpec

# ---- runs -------------------------------------------------------------------------------------------


async def get_run(db: AsyncSession, run_id: UUID) -> OrchRun | None:
    return await db.get(OrchRun, run_id)


async def create_run(
    db: AsyncSession,
    *,
    user_id: UUID,
    spec_name: str,
    topic: str,
    run_input: dict[str, Any],
    bundle: dict[str, Any],
) -> OrchRun:
    run = OrchRun(
        user_id=user_id, spec_name=spec_name, topic=topic, run_input=run_input, bundle=bundle,
        status="queued", stage="排队中", progress=0,
    )  # fmt: skip
    db.add(run)
    await db.flush()
    await db.refresh(run)
    return run


async def list_runs(
    db: AsyncSession, *, user_id: UUID, skip: int, limit: int
) -> tuple[list[OrchRun], int]:
    total = await db.scalar(
        select(func.count()).select_from(OrchRun).where(OrchRun.user_id == user_id)
    )
    result = await db.execute(
        select(OrchRun)
        .where(OrchRun.user_id == user_id)
        .order_by(OrchRun.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return list(result.scalars().all()), int(total or 0)


async def count_active(db: AsyncSession, *, user_id: UUID) -> int:
    return int(
        await db.scalar(
            select(func.count())
            .select_from(OrchRun)
            .where(OrchRun.user_id == user_id, OrchRun.status.in_(("queued", "running")))
        )
        or 0
    )


async def count_since(db: AsyncSession, *, user_id: UUID, since: datetime) -> int:
    return int(
        await db.scalar(
            select(func.count())
            .select_from(OrchRun)
            .where(OrchRun.user_id == user_id, OrchRun.created_at >= since)
        )
        or 0
    )


async def update_run(db: AsyncSession, *, db_run: OrchRun, update_data: dict[str, Any]) -> OrchRun:
    for field, value in update_data.items():
        setattr(db_run, field, value)
    await db.flush()
    await db.refresh(db_run)
    return db_run


async def delete_run(db: AsyncSession, run_id: UUID) -> OrchRun | None:
    run = await get_run(db, run_id)
    if run:
        await db.delete(run)
        await db.flush()
    return run


async def recent_done_runs(db: AsyncSession, *, user_id: UUID, limit: int) -> list[OrchRun]:
    result = await db.execute(
        select(OrchRun)
        .where(OrchRun.user_id == user_id, OrchRun.status == "done")
        .order_by(OrchRun.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


# ---- events -----------------------------------------------------------------------------------------


async def add_event(
    db: AsyncSession, *, run_id: UUID, seq: int, t: float, kind: str, detail: dict[str, Any]
) -> None:
    db.add(OrchEvent(run_id=run_id, seq=seq, t=t, kind=kind, detail=detail))
    await db.flush()


async def list_events(db: AsyncSession, *, run_id: UUID) -> list[OrchEvent]:
    result = await db.execute(
        select(OrchEvent).where(OrchEvent.run_id == run_id).order_by(OrchEvent.seq)
    )
    return list(result.scalars().all())


# ---- specs ------------------------------------------------------------------------------------------


async def list_specs(db: AsyncSession, *, user_id: UUID) -> list[OrchSpec]:
    result = await db.execute(
        select(OrchSpec).where(OrchSpec.user_id == user_id).order_by(OrchSpec.name)
    )
    return list(result.scalars().all())


async def get_spec(db: AsyncSession, *, user_id: UUID, name: str) -> OrchSpec | None:
    result = await db.execute(
        select(OrchSpec).where(OrchSpec.user_id == user_id, OrchSpec.name == name)
    )
    return result.scalar_one_or_none()


async def save_spec(db: AsyncSession, *, user_id: UUID, name: str, yaml_text: str) -> OrchSpec:
    spec = await get_spec(db, user_id=user_id, name=name)
    if spec is None:
        spec = OrchSpec(user_id=user_id, name=name, yaml=yaml_text)
        db.add(spec)
    else:
        spec.yaml = yaml_text
    await db.flush()
    await db.refresh(spec)
    return spec


async def delete_spec(db: AsyncSession, *, user_id: UUID, name: str) -> bool:
    spec = await get_spec(db, user_id=user_id, name=name)
    if spec is None:
        return False
    await db.delete(spec)
    await db.flush()
    return True


# ---- feedback ---------------------------------------------------------------------------------------


async def upsert_feedback(
    db: AsyncSession,
    *,
    run_id: UUID,
    user_id: UUID,
    rating: int,
    tags: list[str],
    comment: str | None,
) -> OrchFeedback:
    result = await db.execute(
        select(OrchFeedback).where(OrchFeedback.run_id == run_id, OrchFeedback.user_id == user_id)
    )
    fb = result.scalar_one_or_none()
    if fb is None:
        fb = OrchFeedback(run_id=run_id, user_id=user_id, rating=rating, tags=tags, comment=comment)
        db.add(fb)
    else:
        fb.rating, fb.tags, fb.comment = rating, tags, comment
    await db.flush()
    await db.refresh(fb)
    return fb


async def feedback_for_runs(db: AsyncSession, *, run_ids: list[UUID]) -> list[OrchFeedback]:
    if not run_ids:
        return []
    result = await db.execute(select(OrchFeedback).where(OrchFeedback.run_id.in_(run_ids)))
    return list(result.scalars().all())


async def gate_events(db: AsyncSession, *, run_ids: list[UUID]) -> list[OrchEvent]:
    if not run_ids:
        return []
    result = await db.execute(
        select(OrchEvent)
        .where(OrchEvent.run_id.in_(run_ids), OrchEvent.kind == "gate_checked")
        .order_by(OrchEvent.run_id, OrchEvent.seq)
    )
    return list(result.scalars().all())
