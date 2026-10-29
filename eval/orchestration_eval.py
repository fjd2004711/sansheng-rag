"""Summarise orchestration runs into the platform's evaluation table (all numbers come from the runs' event logs).

Usage: python eval/orchestration_eval.py run1.json run2.json [--serial serial_run.json] [--out artifacts/orchestration-eval.json]

A run file is the JSON ``GET /api/v1/orchestration/runs/{id}`` returned. What is measured:
- self-loop effect: the first gate check (the draft as the writers delivered it) vs the last (after bounded repair)
- scheduling: wall time vs the busy time of all tasks, and — if a serial-configuration run of the same topic is given —
  the measured speed-up
- independent verifier: claims it downgraded; model fallbacks; tasks failed / skipped
"""

from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path
from typing import Any

KEYS = ("verified_ratio", "authoritative_sections", "unsupported_numbers", "scope_issues")


def load(path: str) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def gate_points(run: dict[str, Any]) -> list[dict[str, Any]]:
    return [e["detail"] for e in run["events"] if e["kind"] == "gate_checked"]


def summarise(run: dict[str, Any]) -> dict[str, Any]:
    gates = gate_points(run)
    first, last = (gates[0], gates[-1]) if gates else ({"metrics": {}, "passed": None}, {"metrics": {}, "passed": None})
    m = run.get("metrics") or {}
    report = (run.get("result") or {}).get("report") or {}
    return {
        "topic": run["topic"],
        "status": run["status"],
        "wall_seconds": m.get("wall_seconds"),
        "busy_seconds": m.get("busy_seconds"),
        "parallel_speedup": m.get("parallel_speedup"),
        "tasks": m.get("tasks"),
        "tasks_failed": m.get("tasks_failed"),
        "tasks_skipped": m.get("tasks_skipped"),
        "llm_calls": m.get("llm_calls"),
        "tokens": m.get("tokens"),
        "repair_rounds": m.get("repair_rounds"),
        "verifier_downgrades": m.get("verifier_downgrades"),
        "model_switches": len(m.get("model_switches") or []),
        "gate_first": {"passed": first["passed"], **{k: first["metrics"].get(k) for k in KEYS}},
        "gate_last": {"passed": last["passed"], **{k: last["metrics"].get(k) for k in KEYS}},
        "first_failures": [f["type"] for f in first.get("failures", [])],
        "recommendations": len(report.get("recommendations") or []),
        "claims_total": sum(len(s.get("claims", [])) for s in report.get("sections", [])),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("runs", nargs="+")
    parser.add_argument("--serial", default=None, help="run of the same topic with concurrency 1")
    parser.add_argument("--out", default="artifacts/orchestration-eval.json")
    args = parser.parse_args()

    rows = [summarise(load(p)) for p in args.runs]
    out: dict[str, Any] = {"runs": rows}
    done = [r for r in rows if r["status"] == "done"]
    if done:
        out["mean"] = {
            k: round(statistics.mean(float(r[k]) for r in done if r[k] is not None), 3)
            for k in ("wall_seconds", "parallel_speedup", "repair_rounds", "verifier_downgrades", "tokens")
        }
    if args.serial:
        serial = summarise(load(args.serial))
        match = next((r for r in rows if r["topic"] == serial["topic"]), None)
        if match and serial["wall_seconds"] and match["wall_seconds"]:
            out["serial_vs_parallel"] = {
                "topic": serial["topic"],
                "serial_wall_seconds": serial["wall_seconds"],
                "parallel_wall_seconds": match["wall_seconds"],
                "measured_speedup": round(serial["wall_seconds"] / match["wall_seconds"], 2),
            }
    Path(args.out).parent.mkdir(exist_ok=True)
    Path(args.out).write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

    for r in rows:
        f, last = r["gate_first"], r["gate_last"]
        print(f"[{r['status']}] {r['topic'][:30]}  wall={r['wall_seconds']}s speedup={r['parallel_speedup']}x tasks={r['tasks']} "
              f"repair_rounds={r['repair_rounds']} downgrades={r['verifier_downgrades']}")
        for k in KEYS:
            print(f"    {k:24} first={f[k]}  final={last[k]}")
        print(f"    gate passed: first={f['passed']} final={last['passed']}; first-check failures: {r['first_failures']}")
    if "serial_vs_parallel" in out:
        print("serial vs parallel:", out["serial_vs_parallel"])
    print("written:", args.out)


if __name__ == "__main__":
    main()
