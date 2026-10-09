"""The P5 dataset is self-consistent (checkable without models): every target phrase is in the corpus."""

import json
from pathlib import Path

EVAL = Path(__file__).resolve().parents[2] / "eval"


def _lines(name: str) -> list[dict]:
    return [
        json.loads(line) for line in (EVAL / name).read_text(encoding="utf-8").splitlines() if line
    ]


def test_scenario_ids_are_unique_and_abstention_has_no_target() -> None:
    scenarios = _lines("p5-scenarios.jsonl")
    ids = [s["id"] for s in scenarios]
    assert len(ids) == len(set(ids))
    for s in scenarios:
        assert (s["expected_phrase"] == "") == s["abstain"]


def test_every_target_phrase_is_in_exactly_one_extra_or_core_document() -> None:
    extra = _lines("p5-corpus-extra.jsonl")
    names = [d["name"] for d in extra]
    assert len(names) == len(set(names))
    core_phrases = {"CRIMSON-SEAL", "ORION-RECOVER-17"}
    for s in _lines("p5-scenarios.jsonl"):
        phrase = s["expected_phrase"]
        if not phrase or phrase in core_phrases:
            continue
        assert sum(phrase in d["text"] for d in extra) == 1, phrase


def test_initial_query_misses_the_target_so_correction_is_actually_needed() -> None:
    for s in _lines("p5-scenarios.jsonl"):
        if s["expected_phrase"]:
            assert s["expected_phrase"].lower() not in s["initial_query"].lower()
