"""P4 transport tests for private corrective trace envelopes."""

import pytest

from app.agents.tools.rag_tool import _append_trace, extract_rag_trace


def test_extract_rag_trace_removes_envelope_and_returns_structured_events() -> None:
    visible, trace = extract_rag_trace(
        _append_trace(
            "[1] Source: policy.txt (score: 0.900)\nEvidence",
            [{"step": "query_rewrite", "round": 1, "status": "COMPLETE", "detail": {}}],
        )
    )

    assert visible == "[1] Source: policy.txt (score: 0.900)\nEvidence"
    assert trace == [{"step": "query_rewrite", "round": 1, "status": "COMPLETE", "detail": {}}]


def test_extract_rag_trace_leaves_ordinary_tool_output_unchanged() -> None:
    content = "No relevant documents found in the knowledge base."
    assert extract_rag_trace(content) == (content, [])


@pytest.mark.anyio
async def test_collect_evidence_forces_retrieval_when_model_skipped_search_tool() -> None:
    from unittest.mock import AsyncMock, MagicMock, patch

    from app.services.agent_session import AgentSession

    session = AgentSession.__new__(AgentSession)
    session.websocket = MagicMock()
    session._turn_trace = []
    envelope = _append_trace(
        "[1] Source: vega.md\nP1 response is 15 minutes",
        [{"step": "retrieve", "round": 1, "status": "COMPLETE", "detail": {}}],
    )
    with (
        patch("app.services.agent_session.search_knowledge_base", AsyncMock(return_value=envelope)) as search,
        patch("app.services.agent_session.send_event", AsyncMock()) as send,
    ):
        evidence = await session._collect_evidence("Vega P1?", [])

    search.assert_awaited_once_with("Vega P1?")
    assert evidence == "[1] Source: vega.md\nP1 response is 15 minutes"
    send.assert_awaited_once()
    assert send.await_args.args[1] == "agent_trace"
    assert session._turn_trace == [{"step": "retrieve", "round": 1, "status": "COMPLETE", "detail": {}}]


@pytest.mark.anyio
async def test_collect_evidence_uses_tool_results_without_extra_search() -> None:
    from unittest.mock import AsyncMock, MagicMock, patch

    from app.services.agent_session import AgentSession

    session = AgentSession.__new__(AgentSession)
    session.websocket = MagicMock()
    session._turn_trace = []
    calls = [{"tool_name": "search_documents", "result": "[1] evidence"}]
    with patch("app.services.agent_session.search_knowledge_base", AsyncMock()) as search:
        evidence = await session._collect_evidence("q", calls)

    search.assert_not_awaited()
    assert evidence == "[1] evidence"
