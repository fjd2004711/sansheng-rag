"""Schemas for answer feedback."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.schemas.base import BaseSchema

FeedbackReason = Literal["wrong", "not_found", "bad_citation", "incomplete", "other"]


class FeedbackCreate(BaseSchema):
    """A thumbs up (1) or down (-1), with an optional reason and comment."""

    rating: Literal[1, -1]
    reason: FeedbackReason | None = None
    comment: str | None = Field(default=None, max_length=1000)


class FeedbackRead(BaseSchema):
    message_id: UUID
    rating: int
    reason: str | None = None
    comment: str | None = None


class ConversationFeedback(BaseSchema):
    """The current user's feedback for a conversation, keyed by message id."""

    items: list[FeedbackRead]


class FeedbackAdminItem(BaseSchema):
    """One feedback entry with enough context to judge what went wrong."""

    id: UUID
    rating: int
    reason: str | None = None
    comment: str | None = None
    created_at: datetime
    user_email: str
    conversation_id: UUID
    message_id: UUID
    question: str | None = None
    answer: str


class FeedbackAdminList(BaseSchema):
    items: list[FeedbackAdminItem]
    total: int
    helpful: int
    not_helpful: int
