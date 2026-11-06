"""Collect every number the submission (proposal, deck, video narration) quotes into one data.json.

All values are computed from files in the repository: the saved real runs in artifacts/orchestration-runs/, the
verification and QA evaluation reports in artifacts/, the source tree (line counts) and a pytest summary line.
Nothing is typed in by hand, so the three deliverables can never disagree with the measured data or with each other.

Usage: python docs/submission/build_data.py [--pytest-summary "487 passed, 4 skipped"] [--vitest "67"]
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUNS = ROOT / "artifacts" / "orchestration-runs"
OUT = Path(__file__).with_name("data.json")

# latest version of each topic first; older versions of the NEV topic show how the run time evolved
MAIN_RUNS = ["p9-employment-latest.json", "p8-nev-pipeline.json", "p3-nev-parallel.json",
             "p1-employment-parallel.json", "p2-nev-parallel.json"]  # fmt: skip
NEV_EVOLUTION = ["p2-nev-parallel.json", "p3-nev-parallel.json", "p4-nev-recheck.json", "p5-nev-perf1.json",
                 "p6-nev-perf2.json", "p7-nev-perf3.json", "p8-nev-pipeline.json"]  # fmt: skip
EVOLUTION_NOTE = {
    "p2-nev-parallel.json": "并行调度（初版）",
    "p3-nev-parallel.json": "并行调度 + 修复采用条件",
    "p4-nev-recheck.json": "加入逐条独立复核",
    "p5-nev-perf1.json": "模型并发 4→6、建议前提并行核验",
    "p6-nev-perf2.json": "全国口径检索前置并行",
    "p7-nev-perf3.json": "补证与逐章评分并行",
    "p8-nev-pipeline.json": "撰写→核查逐项流水线",
}
LEVEL_CN = {"verified": "已核实", "single_source": "单一来源", "disputed": "有争议", "unverified": "未能核实"}
FAILURE_CN = {"weak_evidence": "证据不足", "no_authority": "缺权威来源", "number_mismatch": "数字对不上原文",
              "scope_misplaced": "范围错置"}  # fmt: skip


def load(name: str) -> dict:
    return json.loads((RUNS / name).read_text(encoding="utf-8"))


def pct(v: float | None) -> int | None:
    return None if v is None else round(v * 100)


def draft_seconds(events: list[dict]) -> float:
    """Planning, search, writing and independent verification — up to the first quality-gate check."""
    first_gate = next((e["t"] for e in events if e["kind"] == "gate_checked"), None)
    return round(first_gate if first_gate is not None else max(e["t"] for e in events), 1)


def summarize(name: str) -> dict:
    run = load(name)
    m, ev = run["metrics"], run["events"]
    gates = [e["detail"] for e in ev if e["kind"] == "gate_checked"]
    first, last = (gates[0], gates[-1]) if gates else ({}, {})
    repairs = [
        {"section": e["detail"]["section"], "before": e["detail"]["before"], "after": e["detail"]["after"],
         "accepted": e["kind"] == "repair_accepted"}
        for e in ev if e["kind"] in ("repair_accepted", "repair_rejected")
    ]  # fmt: skip
    groups = {e["detail"]["group"]: len(e["detail"]["tasks"]) for e in ev if e["kind"] == "group_expanded"}
    report = (run.get("result") or {}).get("report") or {}
    claims = [c for s in report.get("sections", []) for c in s.get("claims", [])]
    levels: dict[str, int] = {}
    for c in claims:
        levels[c["level"]] = levels.get(c["level"], 0) + 1
    fm = first.get("metrics", {})
    lm = last.get("metrics", {})
    return {
        "file": name,
        "topic": run["topic"],
        "status": run["status"],
        "wall_seconds": round(m["wall_seconds"]),
        "wall_text": f"{int(m['wall_seconds'] // 60)} 分 {round(m['wall_seconds'] % 60)} 秒",
        "draft_seconds": draft_seconds(ev),
        "busy_seconds": round(m["busy_seconds"]),
        "speedup": m["parallel_speedup"],
        "tasks": m["tasks"],
        "tasks_failed": m["tasks_failed"],
        "llm_calls": m["llm_calls"],
        "tokens": m["tokens"],
        "tokens_wan": round(m["tokens"] / 10000, 1),
        "repair_rounds": m["repair_rounds"],
        "downgrades": m["verifier_downgrades"],
        "sections": groups.get("sections"),
        "search_batches": groups.get("search"),
        "gate_checks": len(gates),
        "gate_first_passed": bool(first.get("passed")),
        "gate_final_passed": bool(last.get("passed")),
        "verified_first": pct(fm.get("verified_ratio")),
        "verified_final": pct(lm.get("verified_ratio")),
        "authority_first": pct(fm.get("authoritative_sections")),
        "authority_final": pct(lm.get("authoritative_sections")),
        "scope_first": int(fm.get("scope_issues", 0)),
        "scope_final": int(lm.get("scope_issues", 0)),
        "first_failures": sorted({FAILURE_CN.get(f["type"], f["type"]) for f in first.get("failures", [])}),
        "first_reasons": first.get("reasons", []),
        "repairs": repairs,
        "repairs_accepted": sum(r["accepted"] for r in repairs),
        "repairs_rejected": sum(not r["accepted"] for r in repairs),
        "report_claims": len(claims),
        "report_levels": {LEVEL_CN.get(k, k): v for k, v in levels.items()},
        "recommendations": len(report.get("recommendations", [])),
        "sources": len(report.get("sources", [])),
    }


def timeline(name: str) -> list[dict]:
    """Per-task start / end on the run clock, for the scheduling Gantt chart."""
    ev = load(name)["events"]
    start = {e["detail"]["task"]: e for e in ev if e["kind"] == "task_start"}
    rows = []
    for e in ev:
        if e["kind"] != "task_done":
            continue
        s = start.get(e["detail"]["task"])
        if s:
            rows.append({"task": e["detail"]["task"], "group": s["detail"]["group"], "label": s["detail"]["label"],
                         "pool": s["detail"].get("pool"), "start": s["t"], "end": e["t"]})  # fmt: skip
    return sorted(rows, key=lambda r: r["start"])


def serial_vs_parallel() -> dict:
    serial, parallel = load("s1-employment-serial.json"), load("p1-employment-parallel.json")
    s, p = draft_seconds(serial["events"]), draft_seconds(parallel["events"])
    return {"topic": serial["topic"], "serial_seconds": round(s), "parallel_seconds": round(p),
            "speedup": round(s / p, 2)}  # fmt: skip


def fact_check() -> dict:
    run = load("f1-fact-check.json")
    claims = [{"text": c["claim"], "level": LEVEL_CN.get(c["level"], c["level"]), "reason": c["reason"]}
              for c in run["result"]["claims"]]  # fmt: skip
    return {"input": run["topic"], "wall_seconds": round(run["metrics"]["wall_seconds"]),
            "tasks": run["metrics"]["tasks"], "claims": claims}  # fmt: skip


def verification_eval() -> dict:
    out = {}
    for key, file in (("synthetic", "verification-eval-live.json"), ("real", "verification-eval-cases_real-live.json")):
        d = json.loads((ROOT / "artifacts" / file).read_text(encoding="utf-8"))
        out[key] = {
            "cases": d["cases"] if isinstance(d["cases"], int) else len(d["cases"]),
            "gold_claims": d["gold_claims"],
            "runs_per_case": d["runs_per_case"],
            "level_accuracy": d["level_accuracy"],
            "false_pass": d["false_pass_rate"],
            "verified_precision": d["verified_precision"],
            "extraction_recall": d["extraction_recall"],
            "generated_at": d["generated_at"][:10],
        }
    return out


def qa_eval() -> dict:
    d = json.loads((ROOT / "artifacts" / "p5-evaluation-report.json").read_text(encoding="utf-8"))
    names = {"Baseline RAG": "基础检索", "Hybrid RAG": "混合检索（BM25 + RRF + 重排）",
             "Corrective RAG": "检索纠错", "Full Self-Correcting RAG": "完整自纠错（检索纠错 + 回答纠错）"}  # fmt: skip
    modes = []
    for mode in d["modes"]:
        mt = mode["metrics"]
        modes.append({"name": names.get(mode["name"], mode["name"]), "recall5": mt["Recall@5"],
                      "grounded": mt["Groundedness"], "complete": mt["Completeness"],
                      "citation": mt["Citation Accuracy"], "abstain": mt["Abstention Accuracy"],
                      "latency_s": round(mt["Latency (ms)"] / 1000, 1)})  # fmt: skip
    counts = d["modes"][0]["scenario_counts"]
    return {"scenarios": d["scenario_count"], "documents": d["corpus_document_count"],
            "answerable": counts["answerable"], "abstain": counts["abstain"], "modes": modes}  # fmt: skip


def code_stats() -> dict:
    orch = ROOT / "backend" / "app" / "services" / "orchestration"
    files = {p.name: sum(1 for _ in p.open(encoding="utf-8")) for p in sorted(orch.glob("*.py")) if p.name != "__init__.py"}
    extra = {
        "research/audit.py": ROOT / "backend/app/services/research/audit.py",
        "research/report_builder.py": ROOT / "backend/app/services/research/report_builder.py",
        "research/report_diagrams.py": ROOT / "backend/app/services/research/report_diagrams.py",
    }
    for k, p in extra.items():
        if p.exists():
            files[k] = sum(1 for _ in p.open(encoding="utf-8"))
    tests = {}
    for p in sorted((ROOT / "backend" / "tests").glob("test_*.py")):
        if "orchestration" in p.name or p.name in ("test_support_recheck.py", "test_report_diagrams.py"):
            tests[p.stem] = len(re.findall(r"^\s*(?:async )?def test_", p.read_text(encoding="utf-8"), re.M))
    fe = ROOT / "frontend" / "src" / "components" / "orchestration"
    fe_lines = sum(sum(1 for _ in p.open(encoding="utf-8")) for p in fe.glob("*.tsx"))
    migrations = len(list((ROOT / "backend" / "alembic" / "versions").glob("*.py")))
    return {"orchestration": files, "orchestration_total": sum(v for k, v in files.items() if "/" not in k),
            "tests": tests, "frontend_orchestration_lines": fe_lines, "frontend_orchestration_files": len(list(fe.glob("*.tsx"))),
            "migrations": migrations}  # fmt: skip


def builtin_specs() -> dict:
    sys.path.insert(0, str(ROOT / "backend"))
    from app.services.orchestration.builtin import BUILTIN_YAML  # noqa: PLC0415

    return {name: text for name, text in BUILTIN_YAML.items()}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pytest-summary", default="")
    ap.add_argument("--vitest", default="")
    args = ap.parse_args()
    runs = [summarize(n) for n in MAIN_RUNS]
    evolution = []
    for n in NEV_EVOLUTION:
        s = summarize(n)
        evolution.append({"file": n, "change": EVOLUTION_NOTE[n], "wall_seconds": s["wall_seconds"],
                          "draft_seconds": s["draft_seconds"], "repair_rounds": s["repair_rounds"],
                          "speedup": s["speedup"], "verified_final": s["verified_final"],
                          "gate_final_passed": s["gate_final_passed"]})  # fmt: skip
    py = re.search(r"(\d+) passed(?:, (\d+) skipped)?", args.pytest_summary)
    commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    data = {
        "commit": commit,
        "runs": runs,
        "by_file": {r["file"]: r for r in runs},
        "gate_passed_final": sum(r["gate_final_passed"] for r in runs),
        "gate_passed_first": sum(r["gate_first_passed"] for r in runs),
        "nev_evolution": evolution,
        "serial_vs_parallel": serial_vs_parallel(),
        "old_loop": summarize("p0-employment-old-loop.json"),
        "timeline_p8": timeline("p8-nev-pipeline.json"),
        "fact_check": fact_check(),
        "verification": verification_eval(),
        "qa": qa_eval(),
        "code": code_stats(),
        "tests": {"backend_passed": int(py.group(1)) if py else None,
                  "backend_skipped": int(py.group(2)) if py and py.group(2) else 0,
                  "frontend_passed": int(args.vitest) if args.vitest else None},  # fmt: skip
        "specs": builtin_specs(),
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"written {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
