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


def test_snippet_centres_on_the_match_and_handles_no_text() -> None:
    from app.schemas.conversation import make_snippet

    text = "前面是一大段无关的内容。" * 10 + "退款需要财务审批" + "后面还有很多内容。" * 10
    snippet = make_snippet(text, "退款")
    assert (
        snippet
        and "退款需要财务审批" in snippet
        and snippet.startswith("…")
        and snippet.endswith("…")
    )
    assert make_snippet(None, "x") is None


@pytest.mark.anyio
async def test_search_is_scoped_to_the_user_and_ignores_blank_queries() -> None:
    uid = uuid4()
    service = ConversationService(AsyncMock())
    with patch("app.services.conversation.conversation_repo") as repo:
        repo.search_conversations = AsyncMock(return_value=[])
        assert await service.search(uid, "   ") == []
        repo.search_conversations.assert_not_awaited()
        await service.search(uid, "100%_done")
        kwargs = repo.search_conversations.await_args.kwargs
        assert kwargs["user_id"] == uid
        assert "\\%" in kwargs["pattern"] and "\\_" in kwargs["pattern"]
