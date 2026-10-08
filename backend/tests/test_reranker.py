"""Tests for P1 reranker response handling."""

from app.services.rag.reranker import _parse_rankings


def test_parse_rankings_accepts_json_with_surrounding_model_text() -> None:
    parsed = _parse_rankings('reasoning\n[{"id": 2, "score": 88}, {"id": 0, "score": 40}]')
    assert parsed == [(2, 88.0), (0, 40.0)]


def test_parse_rankings_rejects_non_json_content() -> None:
    assert _parse_rankings("no structured result") == []
