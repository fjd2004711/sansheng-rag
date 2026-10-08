"""Answer feedback routes: users rate answers, admins review them."""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Query, status

from app.api.deps import CurrentAdmin, CurrentUser, FeedbackSvc
from app.schemas.feedback import (
    ConversationFeedback,
    FeedbackAdminList,
    FeedbackCreate,
    FeedbackRead,
)

router = APIRouter()


@router.get("/feedback", response_model=FeedbackAdminList)
async def list_feedback(
    service: FeedbackSvc,
    _: CurrentAdmin,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    rating: int | None = Query(None, description="1 for helpful, -1 for not helpful"),
) -> Any:
    """All feedback, newest first (admin only)."""
    return await service.admin_list(skip=skip, limit=limit, rating=rating)


@router.get("/conversations/{conversation_id}/feedback", response_model=ConversationFeedback)
async def get_conversation_feedback(
    conversation_id: UUID, service: FeedbackSvc, current_user: CurrentUser
) -> Any:
    """The current user's feedback on a conversation's answers."""
    items = await service.for_conversation(conversation_id=conversation_id, user_id=current_user.id)
    return ConversationFeedback(items=items)


@router.put(
    "/conversations/{conversation_id}/messages/{message_id}/feedback",
    response_model=FeedbackRead,
)
async def submit_feedback(
    conversation_id: UUID,
    message_id: UUID,
    data: FeedbackCreate,
    service: FeedbackSvc,
    current_user: CurrentUser,
) -> Any:
    """Rate an answer (replaces any earlier rating by the same user)."""
    return await service.submit(
        conversation_id=conversation_id, message_id=message_id, user_id=current_user.id, data=data
    )


@router.delete(
    "/conversations/{conversation_id}/messages/{message_id}/feedback",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def remove_feedback(
    conversation_id: UUID, message_id: UUID, service: FeedbackSvc, current_user: CurrentUser
) -> None:
    """Withdraw the current user's rating of an answer."""
    await service.remove(
        conversation_id=conversation_id, message_id=message_id, user_id=current_user.id
    )
