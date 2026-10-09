"""While verification runs, live text is a draft; only verified text is a text_delta."""

from unittest.mock import MagicMock, patch

import pytest
from langchain_core.messages import AIMessageChunk

from app.services.agent_session import AgentSession


async def _emit(buffering: bool) -> list[str]:
    session = AgentSession(MagicMock(), MagicMock(id="u"))
    session._buffer_text_for_verification = buffering
    sent: list[str] = []

    async def fake_send(_ws, event, _data):
        sent.append(event)

    with patch("app.services.agent_session.send_event", fake_send):
        await session._stream_message_chunk(AIMessageChunk(content="hello"))
        await session._stream_verified_output("hello")
    return sent


@pytest.mark.anyio
async def test_with_verification_text_is_draft_then_cleared_before_verified_text() -> None:
    assert await _emit(True) == ["draft_delta", "draft_clear", "text_delta"]


@pytest.mark.anyio
async def test_without_verification_text_streams_directly() -> None:
    assert (await _emit(False))[0] == "text_delta"
