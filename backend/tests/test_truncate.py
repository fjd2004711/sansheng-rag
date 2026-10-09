from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.core.exceptions import NotFoundError
from app.services.conversation import ConversationService


@pytest.mark.anyio
async def test_truncate_requires_ownership_and_a_message_of_that_conversation() -> None:
    cid, uid = uuid4(), uuid4()
    service = ConversationService(AsyncMock())
    with patch("app.services.conversation.conversation_repo") as repo:
        repo.get_conversation_by_id = AsyncMock(
            return_value=SimpleNamespace(id=cid, user_id=uuid4())
        )
        with pytest.raises(NotFoundError):  # someone else's conversation
            await service.truncate_from_message(cid, uuid4(), user_id=uid)

        repo.get_conversation_by_id = AsyncMock(return_value=SimpleNamespace(id=cid, user_id=uid))
        repo.get_message_by_id = AsyncMock(return_value=SimpleNamespace(conversation_id=uuid4()))
        with pytest.raises(NotFoundError):  # message belongs to another conversation
            await service.truncate_from_message(cid, uuid4(), user_id=uid)

        message = SimpleNamespace(conversation_id=cid, created_at=datetime.now(UTC))
        repo.get_message_by_id = AsyncMock(return_value=message)
        repo.delete_messages_from = AsyncMock(return_value=3)
        assert await service.truncate_from_message(cid, uuid4(), user_id=uid) == 3
