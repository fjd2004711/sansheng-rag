"""Token usage repository (PostgreSQL async)."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import Date, Integer, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.token_usage import TokenUsage
from app.db.models.user import User


async def create(
    db: AsyncSession,
    *,
    user_id: UUID,
    conversation_id: UUID | None,
    message_id: UUID | None,
    kind: str,
    source: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    calls: int,
) -> TokenUsage:
    row = TokenUsage(
        user_id=user_id,
        conversation_id=conversation_id,
        message_id=message_id,
        kind=kind,
        source=source,
        model=model,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=prompt_tokens + completion_tokens,
        calls=calls,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def totals_for_user(
    db: AsyncSession, user_id: UUID, since: datetime
) -> tuple[int, int, int, int]:
    """(prompt, completion, total, turns) since ``since``; turns count answer rows only."""
    result = await db.execute(
        select(
            func.coalesce(func.sum(TokenUsage.prompt_tokens), 0),
            func.coalesce(func.sum(TokenUsage.completion_tokens), 0),
            func.coalesce(func.sum(TokenUsage.total_tokens), 0),
            func.coalesce(func.sum(cast(TokenUsage.kind == "answer", Integer)), 0),
        ).where(TokenUsage.user_id == user_id, TokenUsage.created_at >= since)
    )
    prompt, completion, total, turns = result.one()
    return int(prompt), int(completion), int(total), int(turns)


async def by_day_for_user(
    db: AsyncSession, user_id: UUID, since: datetime
) -> list[tuple[str, int]]:
    day = cast(TokenUsage.created_at, Date)
    result = await db.execute(
        select(day, func.sum(TokenUsage.total_tokens))
        .where(TokenUsage.user_id == user_id, TokenUsage.created_at >= since)
        .group_by(day)
        .order_by(day)
    )
    return [(str(d), int(t)) for d, t in result.all()]


async def by_source_for_user(
    db: AsyncSession, user_id: UUID, since: datetime
) -> list[tuple[str, str, int]]:
    result = await db.execute(
        select(TokenUsage.source, TokenUsage.model, func.sum(TokenUsage.total_tokens))
        .where(TokenUsage.user_id == user_id, TokenUsage.created_at >= since)
        .group_by(TokenUsage.source, TokenUsage.model)
        .order_by(func.sum(TokenUsage.total_tokens).desc())
    )
    return [(s, m, int(t)) for s, m, t in result.all()]


async def totals_by_user(db: AsyncSession, since: datetime) -> list[tuple[str, str, int, int, int]]:
    """(email, source, prompt, completion, turns-with-usage) per user and source — for admins."""
    result = await db.execute(
        select(
            User.email,
            TokenUsage.source,
            func.sum(TokenUsage.prompt_tokens),
            func.sum(TokenUsage.completion_tokens),
            func.count(TokenUsage.id),
        )
        .join(User, User.id == TokenUsage.user_id)
        .where(TokenUsage.created_at >= since)
        .group_by(User.email, TokenUsage.source)
        .order_by(func.sum(TokenUsage.total_tokens).desc())
    )
    return [(e, s, int(p), int(c), int(n)) for e, s, p, c, n in result.all()]
