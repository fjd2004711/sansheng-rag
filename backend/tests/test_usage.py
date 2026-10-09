"""Token accounting and per-user isolation."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.core.llm_runtime import LLMRuntime
from app.core.usage_meter import UsageMeter, record_openai_response, record_usage, use_meter
from app.services.usage import UsageService


def test_meter_sums_calls_and_ignores_negatives() -> None:
    meter = UsageMeter()
    meter.add(10, 5)
    meter.add(-3, 2)
    assert (meter.prompt_tokens, meter.completion_tokens, meter.total_tokens, meter.calls) == (
        10,
        7,
        17,
        2,
    )


def test_record_without_a_bound_meter_is_a_noop() -> None:
    record_usage(5, 5)  # must not raise


def test_openai_response_usage_is_recorded_and_missing_usage_tolerated() -> None:
    meter = UsageMeter()
    with use_meter(meter):
        record_openai_response(
            SimpleNamespace(usage=SimpleNamespace(prompt_tokens=7, completion_tokens=3))
        )
        record_openai_response(SimpleNamespace(usage=None))
    assert meter.total_tokens == 10 and meter.calls == 1


def test_meters_are_isolated_per_context() -> None:
    a, b = UsageMeter(), UsageMeter()
    with use_meter(a):
        record_usage(1, 1)
        with use_meter(b):
            record_usage(5, 5)
        record_usage(1, 1)
    assert (a.total_tokens, b.total_tokens) == (4, 10)


@pytest.mark.anyio
async def test_record_labels_source_by_whose_key_paid_and_skips_empty() -> None:
    user_id = uuid4()
    meter = UsageMeter(prompt_tokens=100, completion_tokens=20, calls=3)
    own = LLMRuntime(base_url="https://x/v1", api_key="k", model="mine", is_custom=True)
    with patch("app.services.usage.token_usage_repo") as repo:
        repo.create = AsyncMock()
        service = UsageService(MagicMock())
        await service.record(user_id=user_id, meter=meter, runtime=own, kind="answer")
        await service.record(user_id=user_id, meter=meter, runtime=None, kind="answer")
        await service.record(user_id=user_id, meter=UsageMeter(), runtime=None, kind="answer")
    sources = [call.kwargs["source"] for call in repo.create.await_args_list]
    assert sources == ["custom", "server"]
    assert all(call.kwargs["user_id"] == user_id for call in repo.create.await_args_list)


@pytest.mark.anyio
async def test_summary_only_queries_the_given_user() -> None:
    user_id = uuid4()
    with patch("app.services.usage.token_usage_repo") as repo:
        repo.totals_for_user = AsyncMock(return_value=(10, 5, 15, 2))
        repo.by_day_for_user = AsyncMock(return_value=[("2026-10-09", 15)])
        repo.by_source_for_user = AsyncMock(return_value=[("server", "m", 15)])
        result = await UsageService(MagicMock()).summary(user_id, days=30)
    assert result.totals.total_tokens == 15
    for mock in (repo.totals_for_user, repo.by_day_for_user, repo.by_source_for_user):
        assert all(call.args[1] == user_id for call in mock.await_args_list)


@pytest.mark.anyio
async def test_files_can_only_be_linked_by_their_owner() -> None:
    """Sending someone else's file id must not re-link that file to the caller's message."""
    from app.repositories import chat_file as repo

    db = AsyncMock()
    owner, file_id, message_id = uuid4(), uuid4(), uuid4()
    await repo.link_to_message(db, message_id=message_id, file_ids=[file_id], user_id=owner)
    statement = str(db.execute.await_args.args[0].compile(compile_kwargs={"literal_binds": False}))
    assert "user_id" in statement
