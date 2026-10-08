"""Follow-up suggestion parsing and gating."""

import pytest

from app.services.rag.generation.followups import parse_suggestions, suggest_followups


def test_parse_suggestions_keeps_short_distinct_questions_and_drops_the_asked_one() -> None:
    reply = (
        '好的：["超课时津贴怎么发放？", "超课时津贴怎么发放？", "晚自习值班多少钱？", "'
        + "长" * 50
        + '", "问过的问题"]'
    )
    assert parse_suggestions(reply, "问过的问题") == ["超课时津贴怎么发放？", "晚自习值班多少钱？"]


def test_parse_suggestions_returns_at_most_three() -> None:
    assert len(parse_suggestions('["一","二","三","四","五"]', "x")) == 3


@pytest.mark.parametrize("reply", ["没有数组", "[not json", '{"a": 1}', ""])
def test_parse_suggestions_tolerates_bad_replies(reply: str) -> None:
    assert parse_suggestions(reply, "q") == []


@pytest.mark.anyio
async def test_no_suggestions_for_refusals_or_missing_evidence() -> None:
    async def complete(prompt: str) -> str:
        raise AssertionError("must not call the model")

    assert (
        await suggest_followups("q", "知识库中没有找到足以回答该问题的证据。", "[1] ev", complete)
        == []
    )
    assert await suggest_followups("q", "answer [1]", "", complete) == []
    assert await suggest_followups("q", "answer [1]", "No relevant documents found", complete) == []


@pytest.mark.anyio
async def test_suggestions_come_from_the_model_reply() -> None:
    async def complete(prompt: str) -> str:
        assert "资料片段" in prompt
        return '["晚自习值班多少钱？"]'

    assert await suggest_followups("超课时津贴多少？", "每节 35 元 [1]", "[1] ev", complete) == [
        "晚自习值班多少钱？"
    ]


@pytest.mark.anyio
async def test_model_failure_yields_no_suggestions() -> None:
    async def complete(prompt: str) -> str:
        raise RuntimeError("boom")

    assert await suggest_followups("q", "answer [1]", "[1] ev", complete) == []
