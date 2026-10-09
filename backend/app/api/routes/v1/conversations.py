from typing import Any
from uuid import UUID

from fastapi import APIRouter, Query, status

from app.api.deps import ConversationSvc, CurrentUser
from app.schemas.conversation import (
    ConversationCreate,
    ConversationList,
    ConversationRead,
    ConversationReadWithMessages,
    ConversationSearchHit,
    ConversationSearchResults,
    ConversationUpdate,
    MessageCreate,
    MessageList,
    MessageRead,
    make_snippet,
)

router = APIRouter()


@router.get("", response_model=ConversationList)
async def list_conversations(
    conversation_service: ConversationSvc,
    current_user: CurrentUser,
    skip: int = Query(0, ge=0, description="Number of conversations to skip"),
    limit: int = Query(50, ge=1, le=100, description="Maximum conversations to return"),
    include_archived: bool = Query(False, description="Include archived conversations"),
) -> Any:
    """List conversations for the current user."""
    items, total = await conversation_service.list_conversations(
        user_id=current_user.id,
        skip=skip,
        limit=limit,
        include_archived=include_archived,
    )
    return ConversationList(items=items, total=total)  # ty: ignore[invalid-argument-type]


@router.get("/search", response_model=ConversationSearchResults)
async def search_conversations(
    conversation_service: ConversationSvc,
    current_user: CurrentUser,
    q: str = Query(..., min_length=1, max_length=100),
    limit: int = Query(20, ge=1, le=50),
) -> Any:
    """Search the current user's conversations by title and message text."""
    hits = await conversation_service.search(current_user.id, q, limit=limit)
    return ConversationSearchResults(
        items=[
            ConversationSearchHit(
                id=conversation.id,
                title=conversation.title,
                updated_at=conversation.updated_at or conversation.created_at,
                snippet=make_snippet(content, q),
            )
            for conversation, content in hits
        ]
    )


@router.post("", response_model=ConversationRead, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    conversation_service: ConversationSvc,
    current_user: CurrentUser,
    data: ConversationCreate | None = None,
) -> Any:
    """Create a new conversation."""
    if data is None:
        data = ConversationCreate()
    data = data.model_copy(update={"user_id": current_user.id})
    return await conversation_service.create_conversation(data)


@router.get("/{conversation_id}", response_model=ConversationReadWithMessages)
async def get_conversation(
    conversation_id: UUID,
    conversation_service: ConversationSvc,
    current_user: CurrentUser,
) -> Any:
    """Get a conversation with all its messages."""
    return await conversation_service.get_conversation(
        conversation_id,
        include_messages=True,
        user_id=current_user.id,
    )


@router.patch("/{conversation_id}", response_model=ConversationRead)
async def update_conversation(
    conversation_id: UUID,
    data: ConversationUpdate,
    conversation_service: ConversationSvc,
    current_user: CurrentUser,
) -> Any:
    """Update a conversation's title or archived status."""
    return await conversation_service.update_conversation(
        conversation_id,
        data,
        user_id=current_user.id,
    )


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_conversation(
    conversation_id: UUID,
    conversation_service: ConversationSvc,
    current_user: CurrentUser,
) -> None:
    """Delete a conversation and all its messages."""
    await conversation_service.delete_conversation(
        conversation_id,
        user_id=current_user.id,
    )


@router.post(
    "/{conversation_id}/archive",
    response_model=ConversationRead,
)
async def archive_conversation(
    conversation_id: UUID,
    conversation_service: ConversationSvc,
    current_user: CurrentUser,
) -> Any:
    """Archive a conversation.

    Archived conversations are hidden from the default list view.
    """
    return await conversation_service.archive_conversation(
        conversation_id,
        user_id=current_user.id,
    )


@router.get("/{conversation_id}/messages", response_model=MessageList)
async def list_messages(
    conversation_id: UUID,
    conversation_service: ConversationSvc,
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
) -> Any:
    """List messages in a conversation."""
    items, total = await conversation_service.list_messages(
        conversation_id,
        skip=skip,
        limit=limit,
        include_tool_calls=True,
        user_id=current_user.id,
    )
    return MessageList(items=items, total=total)  # ty: ignore[invalid-argument-type]


@router.post(
    "/{conversation_id}/messages",
    response_model=MessageRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_message(
    conversation_id: UUID,
    data: MessageCreate,
    conversation_service: ConversationSvc,
    current_user: CurrentUser,
) -> Any:
    """Add a message to a conversation."""
    return await conversation_service.add_message(
        conversation_id,
        data,
        user_id=current_user.id,
    )


@router.delete(
    "/{conversation_id}/messages/{message_id}/and-after",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def truncate_from_message(
    conversation_id: UUID,
    message_id: UUID,
    conversation_service: ConversationSvc,
    current_user: CurrentUser,
) -> None:
    """Delete this message and all later ones, so it can be edited and sent again."""
    await conversation_service.truncate_from_message(
        conversation_id, message_id, user_id=current_user.id
    )
