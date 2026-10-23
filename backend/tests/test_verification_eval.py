"""The claim-verification gold set is consistent, and the grading rules still pass it (no models needed)."""

import sys
from datetime import date
from pathlib import Path

EVAL = Path(__file__).resolve().parents[2] / "eval"
sys.path.insert(0, str(EVAL))

from verification_scoring import aggregate, load_cases, match_claim, score_case

from app.services.research.audit import ExtractedClaim, audit_claims
from app.services.research.credibility import registrable_domain, source_tier
from app.services.research.independence import independent_groups
from app.services.research.models import WebSource

CASES = load_cases(EVAL / "verification" / "cases.jsonl")
TODAY = date(2026, 10, 23)


def _source(index: int, url: str, content: str, **kw: object) -> WebSource:
    return WebSource(
        index=index, title="t", url=url, domain=registrable_domain(url), content=content,
        fetched_at="2026-10-23", tier=source_tier(url), **kw,  # type: ignore[arg-type]
    )


def test_case_ids_unique_and_gold_indices_point_at_real_sources() -> None:
    ids = [c["id"] for c in CASES]
    assert len(ids) == len(set(ids))
    for case in CASES:
        indices = {s["index"] for s in case["sources"]}
        for gold in case["gold_claims"]:
            assert set(gold["supporting"]) | set(gold["contradicting"]) <= indices
            assert gold["match"], case["id"]


def test_every_gold_claim_is_actually_in_the_answer() -> None:
    for case in CASES:
        for gold in case["gold_claims"]:
            assert all(p in case["answer"].replace(",", "") for p in gold["match"]), case["id"]


def test_rules_pass_the_gold_set_when_extraction_is_perfect() -> None:
    results = []
    for case in CASES:
        sources = [_source(s["index"], s["url"], s["content"], published_at=s["published_at"], from_snippet=s["from_snippet"]) for s in case["sources"]]
        extracted = [
            ExtractedClaim(claim="".join(g["match"]), supporting=g["supporting"], contradicting=g["contradicting"], time_sensitive=g["time_sensitive"])
            for g in case["gold_claims"]
        ]
        graded = [c.model_dump() for c in audit_claims(extracted, sources, today=TODAY, stale_days=365).claims]
        results.append(score_case(case, graded))
    report = aggregate(results)
    assert report["failures"] == []
    assert report["false_pass_rate"]["rate"] == 0.0


def test_match_claim_needs_every_phrase() -> None:
    graded = [{"claim": "12级风速为 32.7 至 36.9 米/秒"}]
    assert match_claim({"match": ["32.7", "36.9"]}, graded) is graded[0]
    assert match_claim({"match": ["32.7", "38.5"]}, graded) is None


def test_syndicated_copies_are_one_independent_source() -> None:
    sources = [
        _source(1, "https://www.news.cn/a", "新华社北京9月15日电 示范型客机今年已交付60架。"),
        _source(2, "https://www.chinanews.com.cn/b", "据新华社报道，示范型客机今年已交付60架。"),
        _source(3, "https://www.people.com.cn/c", "（转自新华社）示范型客机今年已交付60架。"),
    ]
    assert len(independent_groups(sources)) == 1


def test_independent_reports_stay_separate() -> None:
    sources = [
        _source(1, "https://en.wikipedia.org/wiki/X", "Apollo 11 landed on the Moon on July 20, 1969."),
        _source(2, "https://www.britannica.com/topic/X", "The first crewed lunar landing took place in July 1969, led by Armstrong."),
        _source(3, "https://www.reuters.com/x", "据路透社报道，登月任务在1969年7月完成。"),
    ]
    assert len(independent_groups(sources)) == 3
