"""Message feedback repository (PostgreSQL async)."""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.conversation import Message
from app.db.models.message_feedback import MessageFeedback
from app.db.models.user import User


async def get(db: AsyncSession, *, message_id: UUID, user_id: UUID) -> MessageFeedback | None:
    result = await db.execute(
        select(MessageFeedback).where(
            MessageFeedback.message_id == message_id, MessageFeedback.user_id == user_id
        )
    )
    return result.scalar_one_or_none()


async def upsert(
    db: AsyncSession,
    *,
    message_id: UUID,
    user_id: UUID,
    rating: int,
    reason: str | None,
    comment: str | None,
) -> MessageFeedback:
    feedback = await get(db, message_id=message_id, user_id=user_id)
    if feedback is None:
        feedback = MessageFeedback(message_id=message_id, user_id=user_id)
        db.add(feedback)
    feedback.rating = rating
    feedback.reason = reason
    feedback.comment = comment
    await db.flush()
    await db.refresh(feedback)
    return feedback


async def delete(db: AsyncSession, *, message_id: UUID, user_id: UUID) -> bool:
    feedback = await get(db, message_id=message_id, user_id=user_id)
    if feedback is None:
        return False
    await db.delete(feedback)
    await db.flush()
    return True


async def list_for_messages(
    db: AsyncSession, *, user_id: UUID, message_ids: list[UUID]
) -> list[MessageFeedback]:
    if not message_ids:
        return []
    result = await db.execute(
        select(MessageFeedback).where(
            MessageFeedback.user_id == user_id, MessageFeedback.message_id.in_(message_ids)
        )
    )
    return list(result.scalars().all())


async def list_with_context(
    db: AsyncSession, *, skip: int, limit: int, rating: int | None
) -> tuple[list[tuple[MessageFeedback, str, Message, str | None]], int, int, int]:
    """Feedback newest first, each with the user's email, the answer and the question it answered."""
    query = (
        select(MessageFeedback, User.email, Message)
        .join(Message, Message.id == MessageFeedback.message_id)
        .join(User, User.id == MessageFeedback.user_id)
        .order_by(MessageFeedback.created_at.desc())
    )
    if rating is not None:
        query = query.where(MessageFeedback.rating == rating)
    rows = (await db.execute(query.offset(skip).limit(limit))).all()

    enriched: list[tuple[MessageFeedback, str, Message, str | None]] = []
    for feedback, email, message in rows:
        asked = await db.execute(
            select(Message.content)
            .where(
                Message.conversation_id == message.conversation_id,
                Message.role == "user",
                Message.created_at <= message.created_at,
            )
            .order_by(Message.created_at.desc())
            .limit(1)
        )
        enriched.append((feedback, email, message, asked.scalar_one_or_none()))

    total = await db.scalar(select(func.count()).select_from(MessageFeedback)) or 0
    helpful = (
        await db.scalar(select(func.count()).select_from(MessageFeedback).where(MessageFeedback.rating == 1))
        or 0
    )
    return enriched, total, helpful, total - helpful
