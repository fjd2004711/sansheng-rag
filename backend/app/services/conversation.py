import json
import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.db.models.conversation import Conversation, Message, ToolCall
from app.repositories import chat_file_repo, conversation_repo
from app.schemas.conversation import (
    ConversationCreate,
    ConversationUpdate,
    MessageCreate,
    ToolCallComplete,
    ToolCallCreate,
)

logger = logging.getLogger(__name__)


def _safe_parse_args(args: Any) -> dict:
    """Parse tool call args to a dict; returns {} on failure."""
    if isinstance(args, dict):
        return args
    if isinstance(args, str) and args.strip():
        try:
            return json.loads(args)
        except json.JSONDecodeError:
            return {}
    return {}


class ConversationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    EXPORT_CHUNK_SIZE = 1000
    MESSAGE_EXPORT_LIMIT = 10000

    async def get_conversation(
        self,
        conversation_id: UUID,
        *,
        include_messages: bool = False,
        user_id: UUID | None = None,
    ) -> Conversation:
        conversation = await conversation_repo.get_conversation_by_id(
            self.db, conversation_id, include_messages=include_messages
        )
        if not conversation:
            raise NotFoundError(
                message="Conversation not found",
                details={"conversation_id": str(conversation_id)},
            )
        if (
            user_id is not None
            and hasattr(conversation, "user_id")
            and conversation.user_id is not None
            and str(conversation.user_id) != str(user_id)
        ):
            raise NotFoundError(
                message="Conversation not found",
                details={"conversation_id": str(conversation_id)},
            )
        return conversation

    async def list_conversations(
        self,
        user_id: UUID | None = None,
        *,
        skip: int = 0,
        limit: int = 50,
        include_archived: bool = False,
    ) -> tuple[list[Conversation], int]:
        items = await conversation_repo.get_conversations_by_user(
            self.db,
            user_id=user_id,
            skip=skip,
            limit=limit,
            include_archived=include_archived,
        )
        total = await conversation_repo.count_conversations(
            self.db,
            user_id=user_id,
            include_archived=include_archived,
        )
        return items, total

    async def create_conversation(
        self,
        data: ConversationCreate,
    ) -> Conversation:
        """Create a new conversation."""
        return await conversation_repo.create_conversation(
            self.db,
            user_id=data.user_id,
            title=data.title,
        )

    async def update_conversation(
        self,
        conversation_id: UUID,
        data: ConversationUpdate,
        user_id: UUID | None = None,
    ) -> Conversation:
        conversation = await self.get_conversation(
            conversation_id,
            user_id=user_id,
        )
        update_data = data.model_dump(exclude_unset=True)
        if (
            "active_knowledge_base_ids" in update_data
            and update_data["active_knowledge_base_ids"] is not None
        ):
            update_data["active_knowledge_base_ids"] = [
                str(kb_id) for kb_id in update_data["active_knowledge_base_ids"]
            ]
        return await conversation_repo.update_conversation(
            self.db, db_conversation=conversation, update_data=update_data
        )

    async def archive_conversation(
        self,
        conversation_id: UUID,
        user_id: UUID | None = None,
    ) -> Conversation:
        conversation = await self.get_conversation(
            conversation_id,
            user_id=user_id,
        )
        return await conversation_repo.archive_conversation(self.db, db_conversation=conversation)

    async def delete_conversation(
        self,
        conversation_id: UUID,
        user_id: UUID | None = None,
    ) -> bool:
        conversation = await self.get_conversation(
            conversation_id,
            user_id=user_id,
        )
        await conversation_repo.delete_conversation(self.db, db_conversation=conversation)
        return True

    async def get_conversation_with_messages(
        self,
        conversation_id: UUID,
    ) -> Conversation:
        return await self.get_conversation(conversation_id, include_messages=True)

    async def get_message(self, message_id: UUID) -> Message:
        message = await conversation_repo.get_message_by_id(self.db, message_id)
        if not message:
            raise NotFoundError(
                message="Message not found",
                details={"message_id": str(message_id)},
            )
        return message

    async def list_messages(
        self,
        conversation_id: UUID,
        *,
        skip: int = 0,
        limit: int = 100,
        include_tool_calls: bool = False,
        user_id: UUID | None = None,
    ) -> tuple[list[Message], int]:
        """List messages; when ``user_id`` is given the caller must own the conversation."""
        await self.get_conversation(conversation_id, user_id=user_id)
        items = await conversation_repo.get_messages_by_conversation(
            self.db,
            conversation_id,
            skip=skip,
            limit=limit,
            include_tool_calls=include_tool_calls,
        )
        total = await conversation_repo.count_messages(self.db, conversation_id)
        return list(items), total

    async def add_message(
        self,
        conversation_id: UUID,
        data: MessageCreate,
        *,
        user_id: UUID | None = None,
    ) -> Message:
        await self.get_conversation(conversation_id, user_id=user_id)
        return await conversation_repo.create_message(
            self.db,
            conversation_id=conversation_id,
            role=data.role,
            content=data.content,
            thinking=data.thinking,
            model_name=data.model_name,
            tokens_used=data.tokens_used,
        )

    async def delete_message(self, message_id: UUID) -> bool:
        deleted = await conversation_repo.delete_message(self.db, message_id)
        if not deleted:
            raise NotFoundError(
                message="Message not found",
                details={"message_id": str(message_id)},
            )
        return True

    async def get_tool_call(self, tool_call_id: UUID) -> ToolCall:
        tool_call = await conversation_repo.get_tool_call_by_id(self.db, tool_call_id)
        if not tool_call:
            raise NotFoundError(
                message="Tool call not found",
                details={"tool_call_id": str(tool_call_id)},
            )
        return tool_call

    async def list_tool_calls(self, message_id: UUID) -> list[ToolCall]:
        await self.get_message(message_id)
        return await conversation_repo.get_tool_calls_by_message(self.db, message_id)

    async def start_tool_call(
        self,
        message_id: UUID,
        data: ToolCallCreate,
    ) -> ToolCall:
        await self.get_message(message_id)
        return await conversation_repo.create_tool_call(
            self.db,
            message_id=message_id,
            tool_call_id=data.tool_call_id,
            tool_name=data.tool_name,
            args=data.args,
            started_at=data.started_at or datetime.now(UTC),
        )

    async def complete_tool_call(
        self,
        tool_call_id: UUID,
        data: ToolCallComplete,
    ) -> ToolCall:
        tool_call = await self.get_tool_call(tool_call_id)
        return await conversation_repo.complete_tool_call(
            self.db,
            db_tool_call=tool_call,
            result=data.result,
            completed_at=data.completed_at or datetime.now(UTC),
            success=data.success,
        )

    async def link_files_to_message(self, message_id: UUID, file_ids: list[str]) -> None:
        await chat_file_repo.link_to_message(
            self.db,
            message_id=message_id,
            file_ids=[UUID(fid) for fid in file_ids],
        )

    async def list_attached_files(self, file_ids: list[str]) -> list[Any]:
        return await chat_file_repo.get_many(self.db, [UUID(fid) for fid in file_ids])
