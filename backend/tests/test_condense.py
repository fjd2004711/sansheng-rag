from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.rag.generation.condense import (
    clean_condensed,
    condense_question,
    needs_condensing,
)

HISTORY = [
    {"role": "user", "content": "Nebula 退款要审批吗？"},
    {"role": "assistant", "content": "超过 500 美元需要财务审批。"},
]


def test_no_history_never_condenses() -> None:
    assert not needs_condensing("那它的价格呢？", [])


@pytest.mark.parametrize("q", ["那它的价格呢？", "为什么", "and the deadline?", "多少钱"])
def test_short_or_referential_follow_ups_are_condensed(q: str) -> None:
    assert needs_condensing(q, HISTORY)


def test_long_self_contained_question_is_left_alone() -> None:
    assert not needs_condensing("Atlas 合规流程发布之前必须取得哪一种凭证？请说明", HISTORY)


def test_clean_condensed_strips_labels_quotes_and_rejects_empty_or_huge() -> None:
    assert (
        clean_condensed("问题：「Nebula 退款的价格是多少？」", "x") == "Nebula 退款的价格是多少？"
    )
    assert clean_condensed("", "原问题") == "原问题"
    assert clean_condensed("a" * 500, "原问题") == "原问题"


@pytest.mark.anyio
async def test_condense_uses_model_and_falls_back_on_error() -> None:
    reply = MagicMock()
    reply.choices = [MagicMock(message=MagicMock(content="Nebula 退款审批的价格是多少？"))]
    reply.usage = None
    with patch("app.services.rag.generation.condense.AsyncOpenAI") as client:
        client.return_value.chat.completions.create = AsyncMock(return_value=reply)
        assert await condense_question("那它的价格呢？", HISTORY) == "Nebula 退款审批的价格是多少？"
        client.return_value.chat.completions.create = AsyncMock(side_effect=RuntimeError("down"))
        assert await condense_question("那它的价格呢？", HISTORY) == "那它的价格呢？"
