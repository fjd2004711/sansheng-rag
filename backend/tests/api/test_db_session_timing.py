"""The DB session must commit before the response is sent.

With FastAPI's default request scope a yield dependency's exit code (our commit) runs *after* the
response, so a client that re-reads right after a write could still see the old data. DBSession
therefore uses ``scope="function"``; this test fails if that is ever dropped.
"""

import httpx
import pytest
from fastapi import FastAPI

from app.api.deps import DBSession, get_db_session


@pytest.mark.anyio
async def test_session_commits_before_the_response_is_sent() -> None:
    events: list[str] = []

    async def fake_session():
        yield "session"
        events.append("commit")

    app = FastAPI()
    app.dependency_overrides[get_db_session] = fake_session

    @app.get("/write")
    async def write(db: DBSession) -> dict[str, bool]:
        events.append("handler")
        return {"ok": True}

    async def observe(scope, receive, send):
        async def send_spy(message):
            if message["type"] == "http.response.start":
                events.append("response-start")
            await send(message)

        await app(scope, receive, send_spy)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=observe), base_url="http://test"
    ) as client:
        response = await client.get("/write")

    assert response.status_code == 200
    assert events == ["handler", "commit", "response-start"]
