"""P4 transport tests for private corrective trace envelopes."""

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
