"""Orchestration endpoints: definitions are listed with a graph, validated with readable errors, and need a login."""

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_current_user, get_db_session
from app.main import app
from app.repositories import orchestration as repo
from app.services.orchestration.builtin import REPORT_YAML
from app.services.orchestration.insights import build_insights


@pytest.fixture
async def user_client(mock_db_session, monkeypatch):
    user = SimpleNamespace(
        id=uuid4(),
        email="u@example.com",
        role="user",
        is_active=True,
        full_name=None,
        created_at=datetime.now(UTC),
        updated_at=None,
    )
    monkeypatch.setattr(repo, "list_specs", AsyncMock(return_value=[]))
    app.dependency_overrides[get_db_session] = lambda: mock_db_session
    app.dependency_overrides[get_current_user] = lambda: user
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_specs_list_the_builtin_workflows_with_their_graph(user_client) -> None:
    response = await user_client.get("/api/v1/orchestration/specs")
    assert response.status_code == 200
    items = {i["name"]: i for i in response.json()["items"]}
    assert (
        set(items) == {"verified-report", "fact-check"} and items["fact-check"]["input"] == "text"
    )
    graph = items["verified-report"]["graph"]
    assert [n["id"] for n in graph["nodes"]][:3] == ["plan", "search", "sections"]
    assert {"source": "gate_sections", "target": "repair", "kind": "repair"} in graph["edges"]
    assert any(n["independent"] for n in graph["nodes"])


@pytest.mark.anyio
async def test_validate_accepts_a_good_definition_and_explains_a_bad_one(user_client) -> None:
    ok = await user_client.post("/api/v1/orchestration/specs/validate", json={"yaml": REPORT_YAML})
    assert ok.json()["ok"] is True and ok.json()["name"] == "verified-report"
    bad = await user_client.post(
        "/api/v1/orchestration/specs/validate",
        json={
            "yaml": REPORT_YAML.replace(
                "depends_on: [plan], map_over: query_batches",
                "depends_on: [synthesis], map_over: query_batches",
            )
        },
    )
    assert bad.json()["ok"] is False and "循环依赖" in bad.json()["error"]


@pytest.mark.anyio
async def test_saving_over_a_builtin_name_is_refused(user_client) -> None:
    response = await user_client.post("/api/v1/orchestration/specs", json={"yaml": REPORT_YAML})
    assert response.status_code == 400


@pytest.mark.anyio
async def test_endpoints_require_a_login(client) -> None:
    assert (await client.get("/api/v1/orchestration/specs")).status_code in (401, 403)


def test_insights_turn_gate_failures_and_feedback_into_hints() -> None:
    rid = uuid4()
    gates = [
        {
            "run_id": rid,
            "round": 0,
            "passed": False,
            "metrics": {"verified_ratio": 0.4},
            "failures": [{"type": "scope_misplaced"}, {"type": "weak_evidence"}],
        },
        {
            "run_id": rid,
            "round": 1,
            "passed": True,
            "metrics": {"verified_ratio": 0.7},
            "failures": [],
        },
    ]
    result = build_insights(
        [{"id": rid, "metrics": {"wall_seconds": 300, "parallel_speedup": 1.2, "tokens": 1000}}],
        gates,
        [{"rating": -1, "tags": ["口径不对"]}],
    )
    assert result.failure_types == {"scope_misplaced": 1, "weak_evidence": 1}
    assert result.verified_gain == 0.3
    assert result.verified_gain == 0.3
    assert result.repair_success_rate == 1.0 and result.tags == {"口径不对": 1}
    assert any("全国" in h["suggestion"] for h in result.hints)
    assert any("并行加速" in h["signal"] for h in result.hints)
