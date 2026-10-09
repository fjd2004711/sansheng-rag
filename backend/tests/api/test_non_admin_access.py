"""A signed-in non-admin must be refused by every admin-only route."""

from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_current_user
from app.db.models.user import UserRole
from app.main import app

ADMIN_ONLY = [
    ("GET", "/api/v1/feedback"),
    ("GET", "/api/v1/users"),
]


class RegularUser(SimpleNamespace):
    def has_role(self, role) -> bool:
        return role == UserRole.USER


@pytest.fixture
async def regular_client(mock_db_session):
    from app.api.deps import get_db_session

    user = RegularUser(
        id=uuid4(),
        email="u@example.com",
        role="user",
        is_active=True,
        full_name=None,
        created_at=datetime.now(UTC),
        updated_at=None,
    )
    app.dependency_overrides[get_db_session] = lambda: mock_db_session
    app.dependency_overrides[get_current_user] = lambda: user
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.mark.anyio
@pytest.mark.parametrize(("method", "path"), ADMIN_ONLY)
async def test_admin_route_refuses_regular_user(regular_client, method, path) -> None:
    response = await regular_client.request(method, path)
    assert response.status_code == 403


@pytest.mark.anyio
async def test_llm_config_is_scoped_to_the_caller(regular_client) -> None:
    """Reading one's own model settings works for a regular user and never exposes a key."""
    from unittest.mock import AsyncMock, patch

    with patch("app.services.llm_config.user_llm_config_repo") as repo:
        repo.get_by_user = AsyncMock(return_value=None)
        response = await regular_client.get("/api/v1/llm-config")
    assert response.status_code == 200
    assert response.json()["source"] == "server"
    assert '"api_key"' not in response.text
