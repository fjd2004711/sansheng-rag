"""Read-only queries behind the admin 'what is the knowledge base missing' views."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.conversation import Conversation, Message
from app.db.models.user import User


async def recent_traced_answers(
    db: AsyncSession, *, since: datetime, limit: int
) -> list[tuple[Message, str]]:
    """Newest assistant answers that have a recorded trace, with the asking user's email."""
    result = await db.execute(
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
