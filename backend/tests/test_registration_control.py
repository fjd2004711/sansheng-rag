from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.core.exceptions import AlreadyExistsError, AuthorizationError
from app.schemas.user import UserCreate, UserRole
from app.services.user import UserService


def _service(*, first_user: bool) -> UserService:
    service = UserService(AsyncMock())
    service._is_first_user = AsyncMock(return_value=first_user)  # type: ignore[method-assign]
    return service


def _create_data(role: UserRole = UserRole.USER) -> UserCreate:
    return UserCreate(email="new@example.com", password="long-enough-pw", role=role)


@pytest.mark.anyio
async def test_register_when_closed_is_refused_once_an_account_exists() -> None:
    with (
        patch("app.services.user.settings", SimpleNamespace(ALLOW_REGISTRATION=False)),
        pytest.raises(AuthorizationError),
    ):
        await _service(first_user=False).register(_create_data())


@pytest.mark.anyio
async def test_register_when_closed_still_lets_the_first_account_bootstrap() -> None:
    with (
        patch("app.services.user.settings", SimpleNamespace(ALLOW_REGISTRATION=False)),
        patch("app.services.user.user_repo") as repo,
    ):
        repo.get_by_email = AsyncMock(return_value=None)
        repo.create = AsyncMock(return_value=SimpleNamespace())
        await _service(first_user=True).register(_create_data())
        assert repo.create.await_args.kwargs["role"] == "admin"


@pytest.mark.anyio
async def test_registration_open_reflects_setting_and_bootstrap() -> None:
    with patch("app.services.user.settings", SimpleNamespace(ALLOW_REGISTRATION=False)):
        assert await _service(first_user=False).registration_open() is False
        assert await _service(first_user=True).registration_open() is True
    with patch("app.services.user.settings", SimpleNamespace(ALLOW_REGISTRATION=True)):
        assert await _service(first_user=False).registration_open() is True


@pytest.mark.anyio
async def test_admin_can_create_an_admin_account_while_registration_is_closed() -> None:
    with (
        patch("app.services.user.settings", SimpleNamespace(ALLOW_REGISTRATION=False)),
        patch("app.services.user.user_repo") as repo,
    ):
        repo.get_by_email = AsyncMock(return_value=None)
        repo.create = AsyncMock(return_value=SimpleNamespace())
        await _service(first_user=False).create_by_admin(_create_data(UserRole.ADMIN))
        assert repo.create.await_args.kwargs["role"] == "admin"


@pytest.mark.anyio
async def test_admin_create_rejects_a_taken_email() -> None:
    with patch("app.services.user.user_repo") as repo:
        repo.get_by_email = AsyncMock(return_value=SimpleNamespace())
        with pytest.raises(AlreadyExistsError):
            await _service(first_user=False).create_by_admin(_create_data())
