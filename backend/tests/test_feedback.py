"""Answer feedback: ownership rules and thumbs-down-only reasons."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.core.exceptions import NotFoundError
from app.schemas.feedback import FeedbackCreate
from app.services.feedback import FeedbackService


def make_service() -> FeedbackService:
    return FeedbackService(AsyncMock())


def conversation(owner_id):
    return SimpleNamespace(id=uuid4(), user_id=owner_id)


def message(conversation_id, role="assistant"):
    return SimpleNamespace(id=uuid4(), conversation_id=conversation_id, role=role)


def test_rating_must_be_one_or_minus_one() -> None:
    with pytest.raises(ValidationError):
        FeedbackCreate(rating=0)
    with pytest.raises(ValidationError):
        FeedbackCreate(rating=5)


def test_unknown_reason_is_rejected() -> None:
    with pytest.raises(ValidationError):
        FeedbackCreate(rating=-1, reason="because")


@pytest.mark.anyio
async def test_owner_can_rate_an_assistant_answer_and_reason_is_kept_for_thumbs_down() -> None:
    user_id = uuid4()
    conv = conversation(user_id)
    msg = message(conv.id)
    service = make_service()
    with (
        patch("app.services.feedback.conversation_repo") as conv_repo,
        patch("app.services.feedback.message_feedback_repo") as repo,
    ):
        conv_repo.get_conversation_by_id = AsyncMock(return_value=conv)
        conv_repo.get_message_by_id = AsyncMock(return_value=msg)
        repo.upsert = AsyncMock(return_value="saved")

        result = await service.submit(
            conversation_id=conv.id,
            message_id=msg.id,
            user_id=user_id,
            data=FeedbackCreate(rating=-1, reason="wrong", comment="  日期算错了  "),
        )

    assert result == "saved"
    kwargs = repo.upsert.await_args.kwargs
    assert (kwargs["rating"], kwargs["reason"], kwargs["comment"]) == (-1, "wrong", "日期算错了")


@pytest.mark.anyio
async def test_reason_is_dropped_for_thumbs_up() -> None:
    user_id = uuid4()
    conv = conversation(user_id)
    msg = message(conv.id)
    service = make_service()
    with (
        patch("app.services.feedback.conversation_repo") as conv_repo,
        patch("app.services.feedback.message_feedback_repo") as repo,
    ):
        conv_repo.get_conversation_by_id = AsyncMock(return_value=conv)
        conv_repo.get_message_by_id = AsyncMock(return_value=msg)
        repo.upsert = AsyncMock()
        await service.submit(
            conversation_id=conv.id,
            message_id=msg.id,
            user_id=user_id,
            data=FeedbackCreate(rating=1, reason="wrong", comment=""),
        )
    kwargs = repo.upsert.await_args.kwargs
    assert kwargs["reason"] is None and kwargs["comment"] is None


@pytest.mark.anyio
async def test_other_users_cannot_rate_someone_elses_conversation() -> None:
    conv = conversation(uuid4())
    msg = message(conv.id)
    service = make_service()
    with (
        patch("app.services.feedback.conversation_repo") as conv_repo,
        patch("app.services.feedback.message_feedback_repo") as repo,
    ):
        conv_repo.get_conversation_by_id = AsyncMock(return_value=conv)
        conv_repo.get_message_by_id = AsyncMock(return_value=msg)
        repo.upsert = AsyncMock()
        with pytest.raises(NotFoundError):
            await service.submit(
                conversation_id=conv.id,
                message_id=msg.id,
                user_id=uuid4(),
                data=FeedbackCreate(rating=1),
            )
        repo.upsert.assert_not_called()


@pytest.mark.anyio
@pytest.mark.parametrize("scenario", ["user_message", "other_conversation", "missing"])
async def test_only_assistant_answers_of_that_conversation_can_be_rated(scenario: str) -> None:
    user_id = uuid4()
    conv = conversation(user_id)
    if scenario == "user_message":
        msg = message(conv.id, role="user")
    elif scenario == "other_conversation":
        msg = message(uuid4())
    else:
        msg = None
    service = make_service()
    with patch("app.services.feedback.conversation_repo") as conv_repo:
        conv_repo.get_conversation_by_id = AsyncMock(return_value=conv)
        conv_repo.get_message_by_id = AsyncMock(return_value=msg)
        with pytest.raises(NotFoundError):
            await service.submit(
                conversation_id=conv.id,
                message_id=msg.id if msg else uuid4(),
                user_id=user_id,
                data=FeedbackCreate(rating=1),
            )


@pytest.mark.anyio
async def test_reading_feedback_of_someone_elses_conversation_is_not_found() -> None:
    conv = SimpleNamespace(id=uuid4(), user_id=uuid4(), messages=[])
    service = make_service()
    with patch("app.services.feedback.conversation_repo") as conv_repo:
        conv_repo.get_conversation_by_id = AsyncMock(return_value=conv)
        with pytest.raises(NotFoundError):
            await service.for_conversation(conversation_id=conv.id, user_id=uuid4())


def test_feedback_routes_are_registered() -> None:
    from app.main import app

    paths = {r.path for r in app.routes if hasattr(r, "path")}
    assert "/api/v1/feedback" in paths
    assert "/api/v1/conversations/{conversation_id}/messages/{message_id}/feedback" in paths
    assert "/api/v1/conversations/{conversation_id}/feedback" in paths
