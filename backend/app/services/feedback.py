"""Answer feedback service."""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.db.models.message_feedback import MessageFeedback
from app.repositories import conversation_repo, message_feedback_repo
from app.schemas.feedback import (
    FeedbackAdminItem,
    FeedbackAdminList,
    FeedbackCreate,
    FeedbackRead,
)


class FeedbackService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _owned_assistant_message(
        self, *, conversation_id: UUID, message_id: UUID, user_id: UUID
    ) -> None:
        """Only the conversation's owner may rate, and only assistant answers in that conversation."""
        conversation = await conversation_repo.get_conversation_by_id(self.db, conversation_id)
        if conversation is None or str(conversation.user_id) != str(user_id):
            raise NotFoundError(
                message="Conversation not found", details={"conversation_id": str(conversation_id)}
            )
        message = await conversation_repo.get_message_by_id(self.db, message_id)
        if (
            message is None
            or message.conversation_id != conversation_id
            or message.role != "assistant"
        ):
            raise NotFoundError(
                message="Message not found", details={"message_id": str(message_id)}
            )

    async def submit(
        self, *, conversation_id: UUID, message_id: UUID, user_id: UUID, data: FeedbackCreate
    ) -> MessageFeedback:
        await self._owned_assistant_message(
            conversation_id=conversation_id, message_id=message_id, user_id=user_id
        )
        # A reason only makes sense for a thumbs down.
        reason = data.reason if data.rating == -1 else None
        comment = (data.comment or "").strip() or None
        return await message_feedback_repo.upsert(
            self.db,
            message_id=message_id,
            user_id=user_id,
            rating=data.rating,
            reason=reason,
            comment=comment,
        )

    async def remove(self, *, conversation_id: UUID, message_id: UUID, user_id: UUID) -> None:
        await self._owned_assistant_message(
            conversation_id=conversation_id, message_id=message_id, user_id=user_id
        )
        await message_feedback_repo.delete(self.db, message_id=message_id, user_id=user_id)

    async def for_conversation(self, *, conversation_id: UUID, user_id: UUID) -> list[FeedbackRead]:
        conversation = await conversation_repo.get_conversation_by_id(
            self.db, conversation_id, include_messages=True
        )
        if conversation is None or str(conversation.user_id) != str(user_id):
            raise NotFoundError(
                message="Conversation not found", details={"conversation_id": str(conversation_id)}
            )
        entries = await message_feedback_repo.list_for_messages(
            self.db, user_id=user_id, message_ids=[m.id for m in conversation.messages]
        )
        return [
            FeedbackRead(
                message_id=e.message_id, rating=e.rating, reason=e.reason, comment=e.comment
            )
            for e in entries
        ]

    async def admin_list(self, *, skip: int, limit: int, rating: int | None) -> FeedbackAdminList:
        rows, total, helpful, not_helpful = await message_feedback_repo.list_with_context(
            self.db, skip=skip, limit=limit, rating=rating
        )
        return FeedbackAdminList(
            items=[
                FeedbackAdminItem(
                    id=feedback.id,
                    rating=feedback.rating,
                    reason=feedback.reason,
                    comment=feedback.comment,
                    created_at=feedback.created_at,
                    user_email=email,
                    conversation_id=message.conversation_id,
                    message_id=message.id,
                    question=question,
                    answer=message.content,
                )
                for feedback, email, message, question in rows
            ],
            total=total,
            helpful=helpful,
            not_helpful=not_helpful,
        )
