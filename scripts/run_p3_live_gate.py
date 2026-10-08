"""Live P3 gate using the configured answer model and isolated evidence."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from app.graph.generation_correction import GenerationCorrector
from app.services.rag.generation.evaluator import AnswerEvaluator

REPORT = Path("artifacts/p3-gate-report.json")
EVIDENCE = "[1] Atlas compliance requires the CRIMSON-SEAL credential before release."


async def same_evidence(_: str) -> str:
    return EVIDENCE


async def main() -> None:
    evaluator = AnswerEvaluator()
    corrector = GenerationCorrector(same_evidence, evaluator, max_corrections=1)
    hallucination = await corrector.run(
        "What credential does Atlas compliance require?",
        "Atlas requires a BLUE-SEAL credential [1].",
        EVIDENCE,
    )
    incomplete = await corrector.run(
        "What credential and release condition does Atlas compliance require?",
        "Atlas requires the CRIMSON-SEAL credential [1].",
        EVIDENCE,
    )
    report = {
        "hallucination": hallucination.model_dump(mode="json"),
        "incomplete": incomplete.model_dump(mode="json"),
        "pass": {
            "hallucination_regenerated_without_search": (
                not hallucination.abstained
                and hallucination.correction_round == 1
                and [event.step for event in hallucination.trace]
                == ["answer_verify", "regenerate", "answer_reverify"]
                and "CRIMSON-SEAL" in hallucination.answer
            ),
            "incomplete_uses_subquery": (
                not incomplete.abstained
                and any(event.step == "answer_diagnose" for event in incomplete.trace)
                and any(event.step == "retrieve_missing" for event in incomplete.trace)
                and incomplete.trace[-1].status == "PASS"
            ),
            "bounded": hallucination.correction_round <= 1 and incomplete.correction_round <= 1,
        },
    }
    report["all_pass"] = all(report["pass"].values())
    REPORT.parent.mkdir(exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report["pass"], ensure_ascii=False))
    if not report["all_pass"]:
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
