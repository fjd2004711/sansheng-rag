"""Score the research claim-verification pipeline against the human-labelled gold set.

    cd backend && uv run python ../eval/run_verification_eval.py --mode oracle
    cd backend && uv run python ../eval/run_verification_eval.py --mode live --repeat 3

oracle: the gold labels stand in for the model's extraction, so only the fixed grading rules (source tiers,
        independence, staleness) are tested. Deterministic, no network.
live:   the configured model extracts the claims and picks supporting / contradicting sources from the fixed
        source texts, then the same rules grade them. Measures the whole verification step end to end.

The report is written to artifacts/verification-eval-<mode>.json. Never edit it by hand.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from verification_scoring import aggregate, load_cases, oracle_claim_text, score_case

from app.services.research.audit import ExtractedClaim, audit_claims, extract_claims
from app.services.research.corpus import format_evidence
from app.services.research.credibility import registrable_domain, source_tier
from app.services.research.models import WebSource

TODAY = date(2026, 10, 23)
STALE_DAYS = 365


PASSAGE_CHARS = 900
PASSAGES_PER_PAGE = 3


def select_passages(text: str, query: str) -> str:
    """Production feeds the audit retrieved passages, not whole pages: keep the few most relevant ones.

    Approximates retrieval with character-bigram overlap against question + answer (numbers weigh double).
    """
    if len(text) <= PASSAGE_CHARS * PASSAGES_PER_PAGE:
        return text
    chunks: list[str] = []
    current = ""
    for para in re.split(r"\n\s*\n", text):
        if current and len(current) + len(para) > PASSAGE_CHARS:
            chunks.append(current.strip())
            current = ""
        current += para + "\n\n"
    if current.strip():
        chunks.append(current.strip())
    q = re.sub(r"\s+", "", query)
    grams = {q[i : i + 2] for i in range(len(q) - 1)}
    numbers = set(re.findall(r"\d+(?:\.\d+)?", query))

    def score(chunk: str) -> float:
        flat = re.sub(r"\s+", "", chunk)
        return sum(g in flat for g in grams) + 2 * sum(n in flat for n in numbers)

    ranked = sorted(range(len(chunks)), key=lambda i: -score(chunks[i]))[:PASSAGES_PER_PAGE]
    return "\n…\n".join(chunks[i] for i in sorted(ranked))


def resolve_source(s: dict[str, Any], query: str = "") -> dict[str, Any]:
    """A source is either inline or a reference to a frozen real-page snapshot (verification/real/snapshots)."""
    if "snapshot" not in s:
        return s
    snap = json.loads((HERE / "verification" / "real" / "snapshots" / f"{s['snapshot']}.json").read_text("utf-8"))
    return {
        "index": s["index"],
        "title": snap["title"],
        "url": snap["url"],
        "content": select_passages(snap["text"], query),
        "published_at": snap["published_at"],
        "from_snippet": snap["from_snippet"],
    }


def to_sources(case: dict[str, Any]) -> list[WebSource]:
    return [
        WebSource(
            index=s["index"],
            title=s["title"],
            url=s["url"],
            domain=registrable_domain(s["url"]),
            content=s["content"],
            fetched_at=TODAY.isoformat(),
            published_at=s["published_at"],
            from_snippet=s["from_snippet"],
            tier=source_tier(s["url"]),
        )
        for s in (resolve_source(x, case["question"] + case["answer"]) for x in case["sources"])
    ]


def oracle_claims(case: dict[str, Any]) -> list[ExtractedClaim]:
    return [
        ExtractedClaim(
            claim=oracle_claim_text(case, g),
            supporting=g["supporting"],
            contradicting=g["contradicting"],
            time_sensitive=g["time_sensitive"],
        )
        for g in case["gold_claims"]
    ]


async def grade(case: dict[str, Any], mode: str) -> list[dict[str, Any]]:
    sources = to_sources(case)
    if mode == "oracle":
        extracted = oracle_claims(case)
    else:
        extracted = await extract_claims(case["question"], case["answer"], format_evidence(sources))
    audit = audit_claims(extracted, sources, today=TODAY, stale_days=STALE_DAYS)
    return [c.model_dump() for c in audit.claims]


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["oracle", "live"], default="oracle")
    parser.add_argument("--repeat", type=int, default=1, help="live only: runs per case, to expose model variance")
    parser.add_argument("--cases", default=str(HERE / "verification" / "cases.jsonl"))
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    cases = load_cases(Path(args.cases))
    runs = args.repeat if args.mode == "live" else 1
    results: list[dict[str, Any]] = []
    for _ in range(runs):
        for case in cases:
            results.append(score_case(case, await grade(case, args.mode)))
    report = {
        "mode": args.mode,
        "generated_at": datetime.now(UTC).isoformat(),
        "today": TODAY.isoformat(),
        "cases": len(cases),
        "runs_per_case": runs,
        **aggregate(results),
    }
    out = Path(args.out) if args.out else HERE.parent / "artifacts" / f"verification-eval-{args.mode}.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    def show(name: str) -> str:
        m = report[name]
        return "n/a" if m["rate"] is None else f"{m['rate']:.3f} (95%CI {m['ci95'][0]:.3f}-{m['ci95'][1]:.3f}, n={m['n']})"

    print(f"mode={args.mode} cases={len(cases)} gold_claims={report['gold_claims']} runs={runs}")
    for name in ("extraction_recall", "false_pass_rate", "verified_precision", "level_accuracy", "support_set_accuracy", "stale_accuracy"):
        print(f"  {name:22} {show(name)}")
    print(f"  spurious_claims        {report['spurious_claims']}")
    for f in report["failures"]:
        print(f"  ✗ {f['case']} [{f['category']}] expected={f['expected_level']} got={f['level']} false_pass={f['false_pass']}")
    for u in report["unextracted"]:
        print(f"  · {u['case']} not extracted: {u['claim']}")
    print(f"report: {out}")


if __name__ == "__main__":
    asyncio.run(main())
