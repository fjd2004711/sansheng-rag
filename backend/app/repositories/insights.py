"""Read-only queries behind the admin 'what is the knowledge base missing' views."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.conversation import Conversation, Message
from app.db.models.message_feedback import MessageFeedback
from app.db.models.token_usage import TokenUsage
from app.db.models.user import User


async def recent_traced_answers(
    db: AsyncSession, *, since: datetime, limit: int, user_id: UUID | None = None
) -> list[tuple[Message, str]]:
    """Newest assistant answers that have a recorded trace, with the asking user's email."""
    query = (
        select(Message, User.email)
        .join(Conversation, Conversation.id == Message.conversation_id)
        .join(User, User.id == Conversation.user_id)
        .where(
            Message.role == "assistant",
            Message.agent_trace.is_not(None),
            Message.created_at >= since,
        )
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    if user_id is not None:
        query = query.where(Conversation.user_id == user_id)
    result = await db.execute(query)
    return [(row[0], row[1]) for row in result.all()]


async def question_asked_before(
    db: AsyncSession, *, conversation_id: UUID, before: datetime
) -> str | None:
    result = await db.execute(
        select(Message.content)
        .where(
            Message.conversation_id == conversation_id,
            Message.role == "user",
            Message.created_at <= before,
        )
        .order_by(Message.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def ratings_for(db: AsyncSession, message_ids: list[UUID]) -> dict[UUID, int]:
    """Best-known rating per message (1 helpful / -1 not helpful); several raters collapse to their sum's sign."""
    if not message_ids:
        return {}
    result = await db.execute(
        select(MessageFeedback.message_id, func.sum(MessageFeedback.rating))
        .where(MessageFeedback.message_id.in_(message_ids))
        .group_by(MessageFeedback.message_id)
    )
    return {mid: (1 if total > 0 else -1 if total < 0 else 0) for mid, total in result.all()}


async def tokens_for(db: AsyncSession, message_ids: list[UUID]) -> dict[UUID, int]:
    if not message_ids:
        return {}
    result = await db.execute(
        select(TokenUsage.message_id, func.sum(TokenUsage.total_tokens))
        .where(TokenUsage.message_id.in_(message_ids))
        .group_by(TokenUsage.message_id)
    )
    return {mid: int(total) for mid, total in result.all()}
