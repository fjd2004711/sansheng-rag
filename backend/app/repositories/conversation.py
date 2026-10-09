"""Conversation repository."""

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import delete as sql_delete
from sqlalchemy import func, select
from sqlalchemy import update as sql_update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models.chat_file import ChatFile
from app.db.models.conversation import Conversation, Message, ToolCall


async def get_conversation_by_id(
    db: AsyncSession,
    conversation_id: UUID,
    *,
    include_messages: bool = False,
) -> Conversation | None:
    """Get conversation by ID, optionally with messages."""
    if include_messages:
        query = (
            select(Conversation)
            .options(
                selectinload(Conversation.messages).selectinload(Message.tool_calls),
                selectinload(Conversation.messages).selectinload(Message.files),
            )
            .where(Conversation.id == conversation_id)
        )
        result = await db.execute(query)
        return result.scalar_one_or_none()
    return await db.get(Conversation, conversation_id)


async def get_conversations_by_user(
    db: AsyncSession,
    user_id: UUID | None = None,
    *,
    skip: int = 0,
    limit: int = 50,
    include_archived: bool = False,
) -> list[Conversation]:
    """Get conversations for a user with pagination."""
    query = select(Conversation)
    if user_id:
        query = query.where(Conversation.user_id == user_id)
    if not include_archived:
        query = query.where(Conversation.is_archived == False)  # noqa: E712
    query = (
        query.order_by(func.coalesce(Conversation.updated_at, Conversation.created_at).desc())
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(query)
    return list(result.scalars().all())


async def search_conversations(
    db: AsyncSession, *, user_id: UUID, pattern: str, limit: int = 20
) -> list[tuple[Conversation, str | None]]:
    """The user's conversations whose title or message text matches ``pattern`` (an ILIKE pattern).

    Each hit carries the text of one matching message (None when only the title matched).
    """
    by_message = (
        select(Message.conversation_id, func.max(Message.content).label("content"))
        .where(Message.content.ilike(pattern, escape="\\"))
        .group_by(Message.conversation_id)
        .subquery()
    )
    query = (
        select(Conversation, by_message.c.content)
        .outerjoin(by_message, by_message.c.conversation_id == Conversation.id)
        .where(
            Conversation.user_id == user_id,
            Conversation.title.ilike(pattern, escape="\\") | (by_message.c.content.is_not(None)),
        )
        .order_by(func.coalesce(Conversation.updated_at, Conversation.created_at).desc())
        .limit(limit)
    )
    result = await db.execute(query)
    return [(row[0], row[1]) for row in result.all()]


async def count_conversations(
    db: AsyncSession,
    user_id: UUID | None = None,
    *,
    include_archived: bool = False,
) -> int:
    """Count conversations for a user."""
    query = select(func.count(Conversation.id))
    if user_id:
        query = query.where(Conversation.user_id == user_id)
    if not include_archived:
        query = query.where(Conversation.is_archived == False)  # noqa: E712
    result = await db.execute(query)
    return result.scalar() or 0


async def create_conversation(
    db: AsyncSession,
    *,
    user_id: UUID | None = None,
    title: str | None = None,
) -> Conversation:
    """Create a new conversation."""
    conversation = Conversation(
        user_id=user_id,
        title=title,
    )
    db.add(conversation)
    await db.flush()
    await db.refresh(conversation)
    return conversation


async def update_conversation(
    db: AsyncSession,
    *,
    db_conversation: Conversation,
    update_data: dict[str, Any],
) -> Conversation:
    """Update a conversation."""
    for field, value in update_data.items():
        setattr(db_conversation, field, value)

    db.add(db_conversation)
    await db.flush()
    await db.refresh(db_conversation)
    return db_conversation


async def archive_conversation(
    db: AsyncSession,
    *,
    db_conversation: Conversation,
) -> Conversation:
    """Archive a conversation."""
    db_conversation.is_archived = True
    db.add(db_conversation)
    await db.flush()
    await db.refresh(db_conversation)
    return db_conversation


async def delete_conversation(db: AsyncSession, *, db_conversation: Conversation) -> None:
    """Delete a conversation and all related messages/tool_calls (cascades)."""
    await db.delete(db_conversation)
    await db.flush()


async def get_message_by_id(db: AsyncSession, message_id: UUID) -> Message | None:
    """Get message by ID."""
    return await db.get(Message, message_id)


async def get_messages_by_conversation(
    db: AsyncSession,
    conversation_id: UUID,
    *,
    skip: int = 0,
    limit: int = 100,
    include_tool_calls: bool = False,
) -> list[Message]:
    """Get messages for a conversation with pagination."""
    query = select(Message).where(Message.conversation_id == conversation_id)
    if include_tool_calls:
        query = query.options(selectinload(Message.tool_calls))
    query = query.options(selectinload(Message.files))
    query = query.order_by(Message.created_at.asc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())


async def count_messages(db: AsyncSession, conversation_id: UUID) -> int:
    """Count messages in a conversation."""
    query = select(func.count(Message.id)).where(Message.conversation_id == conversation_id)
    result = await db.execute(query)
    return result.scalar() or 0


async def create_message(
    db: AsyncSession,
    *,
    conversation_id: UUID,
    role: str,
    content: str,
    thinking: str | None = None,
    model_name: str | None = None,
    tokens_used: int | None = None,
    agent_trace: list[dict[str, Any]] | None = None,
) -> Message:
    """Create a new message."""
    message = Message(
        conversation_id=conversation_id,
        role=role,
        content=content,
        thinking=thinking,
        model_name=model_name,
        tokens_used=tokens_used,
        agent_trace=agent_trace,
    )
    db.add(message)
    await db.flush()
    await db.refresh(message)

    await db.execute(
        sql_update(Conversation)
        .where(Conversation.id == conversation_id)
        .values(updated_at=message.created_at)
    )

    return message


async def delete_messages_from(db: AsyncSession, *, conversation_id: UUID, message: Message) -> int:
    """Delete ``message`` and every later message of the conversation; return how many went.

    Files attached to the deleted messages are detached first (not deleted) so an edited
    message can be sent again with the same attachments.
    """
    later = select(Message.id).where(
        Message.conversation_id == conversation_id, Message.created_at >= message.created_at
    )
    await db.execute(
        sql_update(ChatFile).where(ChatFile.message_id.in_(later)).values(message_id=None)
    )
    result = await db.execute(
        sql_delete(Message).where(
            Message.conversation_id == conversation_id, Message.created_at >= message.created_at
        )
    )
    await db.flush()
    return int(result.rowcount or 0)


async def delete_message(db: AsyncSession, message_id: UUID) -> bool:
    """Delete a message."""
    message = await get_message_by_id(db, message_id)
    if message:
        await db.delete(message)
        await db.flush()
        return True
    return False


async def get_tool_call_by_id(db: AsyncSession, tool_call_id: UUID) -> ToolCall | None:
    """Get tool call by ID."""
    return await db.get(ToolCall, tool_call_id)


async def get_tool_calls_by_message(
    db: AsyncSession,
    message_id: UUID,
) -> list[ToolCall]:
    """Get tool calls for a message."""
    query = (
        select(ToolCall)
        .where(ToolCall.message_id == message_id)
        .order_by(ToolCall.started_at.asc())
    )
    result = await db.execute(query)
    return list(result.scalars().all())


async def create_tool_call(
    db: AsyncSession,
    *,
    message_id: UUID,
    tool_call_id: str,
    tool_name: str,
    args: dict[str, Any],
    started_at: datetime,
) -> ToolCall:
    """Create a new tool call record."""
    tool_call = ToolCall(
        message_id=message_id,
        tool_call_id=tool_call_id,
        tool_name=tool_name,
        args=args,
        started_at=started_at,
        status="running",
    )
    db.add(tool_call)
    await db.flush()
    await db.refresh(tool_call)
    return tool_call


async def complete_tool_call(
    db: AsyncSession,
    *,
    db_tool_call: ToolCall,
    result: str,
    completed_at: datetime,
    success: bool = True,
) -> ToolCall:
    """Mark a tool call as completed."""
    db_tool_call.result = result
    db_tool_call.completed_at = completed_at
    db_tool_call.status = "completed" if success else "failed"

    if db_tool_call.started_at:
        delta = completed_at - db_tool_call.started_at
        db_tool_call.duration_ms = int(delta.total_seconds() * 1000)

    db.add(db_tool_call)
    await db.flush()
    await db.refresh(db_tool_call)
    return db_tool_call
