"""Tests for P1 reranker response handling."""

from app.services.rag.reranker import _parse_rankings


def test_parse_rankings_accepts_json_with_surrounding_model_text() -> None:
    parsed = _parse_rankings('reasoning\n[{"id": 2, "score": 88}, {"id": 0, "score": 40}]')
    assert parsed == [(2, 88.0), (0, 40.0)]


def test_parse_rankings_rejects_non_json_content() -> None:
    assert _parse_rankings("no structured result") == []


def test_parse_rankings_skips_a_stray_bracket_before_the_array() -> None:
    from app.services.rag.reranker import _parse_rankings

    text = '说明 [注意] 排序如下：\n```json\n[{"id": 1, "score": 90}, {"id": 0, "score": 40}]\n```'
    assert _parse_rankings(text) == [(1, 90.0), (0, 40.0)]


def test_parse_rankings_keeps_complete_items_of_a_truncated_reply() -> None:
    from app.services.rag.reranker import _parse_rankings

    text = '[{"id": 2, "score": 88}, {"id": 0, "score": 70}, {"id": 1, "sco'
    assert _parse_rankings(text) == [(2, 88.0), (0, 70.0)]


def test_parse_rankings_returns_nothing_for_prose() -> None:
    from app.services.rag.reranker import _parse_rankings

    assert _parse_rankings("这些资料都不相关") == []
