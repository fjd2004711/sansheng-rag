"""Pure scoring for the claim-verification gold set (no models, no network).

A gold claim is matched to a graded claim when every ``match`` phrase occurs in the graded claim text. The
headline numbers are *false pass* (a claim that is false, unsupported, overstated, unconfirmed or contested
graded "verified") and *verified precision* (how often a "verified" verdict is really true).
"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from eval_stats import bootstrap_ci


def load_cases(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _norm(text: str) -> str:
    return "".join(text.replace(",", "").replace("，", "").split())


def oracle_claim_text(case: dict[str, Any], gold: dict[str, Any]) -> str:
    """The answer clause a perfect extractor would have produced for this gold claim (citations removed)."""
    answer = re.sub(r"\s*\[\d+\]", "", case["answer"])
    phrases = [_norm(p) for p in gold["match"]]
    for clause in re.split(r"(?<=[。；！？，;!?,])|(?<=\.)(?=\s)", answer):
        if all(p in _norm(clause) for p in phrases):
            return clause.strip()
    return "".join(gold["match"])


def match_claim(gold: dict[str, Any], graded: Sequence[dict[str, Any]]) -> dict[str, Any] | None:
    phrases = [_norm(p) for p in gold["match"]]
    return next((g for g in graded if all(p in _norm(g["claim"]) for p in phrases)), None)


def score_case(case: dict[str, Any], graded: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """Per-gold-claim results plus the number of graded claims that match no gold claim."""
    rows: list[dict[str, Any]] = []
    used: set[int] = set()
    for gold in case["gold_claims"]:
        hit = match_claim(gold, graded)
        row: dict[str, Any] = {
            "case": case["id"],
            "category": case["category"],
            "claim": gold["match"],
            "truth": gold["truth"],
            "expected_level": gold["expected_level"],
            "matched": hit is not None,
        }
        if hit is not None:
            used.add(id(hit))
            level = hit["level"]
            row.update(
                level=level,
                level_ok=level == gold["expected_level"],
                false_pass=gold["truth"] != "true" and level == "verified",
                support_ok=sorted(hit["citation_indices"]) == sorted(gold["supporting"])
                and sorted(hit["contradicting"]) == sorted(gold["contradicting"]),
                stale_ok=bool(hit.get("stale")) == bool(gold["expected_stale"]) if gold["time_sensitive"] else None,
            )
        rows.append(row)
    spurious = sum(1 for g in graded if id(g) not in used)
    return {"rows": rows, "spurious": spurious}


def _rate(flags: Sequence[bool]) -> dict[str, Any]:
    if not flags:
        return {"n": 0, "rate": None, "ci95": None}
    values = [1.0 if f else 0.0 for f in flags]
    return {"n": len(values), "rate": round(sum(values) / len(values), 4), "ci95": list(bootstrap_ci(values))}


def aggregate(results: Sequence[dict[str, Any]]) -> dict[str, Any]:
    rows = [row for r in results for row in r["rows"]]
    matched = [r for r in rows if r["matched"]]
    not_true = [r for r in matched if r["truth"] != "true"]
    graded_verified = [r for r in matched if r["level"] == "verified"]
    by_category: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in matched:
        by_category[r["category"]].append(r)
    return {
        "gold_claims": len(rows),
        "extraction_recall": _rate([r["matched"] for r in rows]),
        "false_pass_rate": _rate([r["false_pass"] for r in not_true]),
        "verified_precision": _rate([r["truth"] == "true" for r in graded_verified]),
        "level_accuracy": _rate([r["level_ok"] for r in matched]),
        "support_set_accuracy": _rate([r["support_ok"] for r in matched]),
        "stale_accuracy": _rate([r["stale_ok"] for r in matched if r["stale_ok"] is not None]),
        "spurious_claims": sum(r["spurious"] for r in results),
        "by_category": {
            cat: {
                "level_accuracy": _rate([r["level_ok"] for r in items]),
                "false_pass": sum(1 for r in items if r["false_pass"]),
            }
            for cat, items in sorted(by_category.items())
        },
        "failures": [r for r in matched if not r["level_ok"] or r["false_pass"]],
        "unextracted": [r for r in rows if not r["matched"]],
    }
