"""Dev-only mock of the orchestration API, serving the saved real runs in artifacts/orchestration-runs/.

Lets the front end be designed and screenshotted against real data without a database, search service or model.
Usage: uv run uvicorn scripts.orch_mock_server:app --port 8010   (then BACKEND_URL=http://localhost:8010 for Next.js)
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from fastapi import FastAPI, HTTPException

from app.schemas.orchestration import Insights
from app.services.orchestration.builtin import BUILTIN_YAML, builtin_bundles
from app.services.orchestration.facade import graph_of
from app.services.orchestration.insights import build_insights
from app.services.orchestration.spec import parse_bundle

RUNS_DIR = Path(__file__).resolve().parents[2] / "artifacts" / "orchestration-runs"
app = FastAPI()
_BUNDLES = builtin_bundles()
_FILES = {
    "p1-employment-parallel.json": "verified-report",
    "p2-nev-parallel.json": "verified-report",
    "s1-employment-serial.json": "verified-report-serial",
    "f1-fact-check.json": "fact-check",
    "p0-employment-old-loop.json": "verified-report",
}


def _runs() -> list[dict]:
    out = []
    now = datetime.now(UTC)
    for i, (name, spec) in enumerate(_FILES.items()):
        data = json.loads((RUNS_DIR / name).read_text(encoding="utf-8"))
        data["id"] = str(uuid5(NAMESPACE_URL, name))
        data["spec_name"] = spec
        data["created_at"] = (now - timedelta(hours=i * 3 + 1)).isoformat()
        data["updated_at"] = data["created_at"]
        if name == "p0-employment-old-loop.json":  # shown mid-flight, to design the live state against real events
            data.update(status="running", progress=58, stage="撰写并核对：总体规模", result=None, metrics=None, error=None)
            data["events"] = [e for e in data["events"] if e["t"] <= 250]
            data["created_at"] = (now - timedelta(seconds=290)).isoformat()
        out.append(data)
    return out


def _bundle(spec: str):
    if spec in _BUNDLES:
        return _BUNDLES[spec]
    text = BUILTIN_YAML["verified-report"].replace("name: verified-report", f"name: {spec}", 1)
    return parse_bundle(text)


@app.get("/api/v1/auth/me")
def me() -> dict:
    return {
        "id": "00000000-0000-0000-0000-000000000001", "email": "demo@example.com", "full_name": "演示用户",
        "is_active": True, "role": "admin", "avatar_url": None, "created_at": datetime.now(UTC).isoformat(),
    }  # fmt: skip


@app.get("/api/v1/orchestration/specs")
def specs() -> dict:
    items = []
    for name, text in BUILTIN_YAML.items():
        b = parse_bundle(text)
        items.append({"name": name, "description": b.workflow.description, "builtin": True, "yaml": text,
                      "graph": graph_of(b).model_dump(), "input": "text" if name == "fact-check" else "topic"})  # fmt: skip
    mine = BUILTIN_YAML["verified-report"].replace("name: verified-report", "name: verified-report-serial", 1)
    b = parse_bundle(mine)
    items.append({"name": "verified-report-serial", "description": "同一套团队与流程，但搜索和模型并发都限制为 1（串行对照）", "builtin": False,
                  "yaml": mine, "graph": graph_of(b).model_dump(), "input": "topic"})  # fmt: skip
    return {"items": items}


@app.post("/api/v1/orchestration/specs/validate")
def validate(body: dict) -> dict:
    try:
        b = parse_bundle(body["yaml"])
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": getattr(exc, "message", str(exc)), "name": None, "graph": None}
    return {"ok": True, "error": None, "name": b.workflow.name, "graph": graph_of(b).model_dump()}


@app.get("/api/v1/orchestration/runs")
def runs() -> dict:
    items = [{k: v for k, v in r.items() if k not in ("events", "result", "graph")} for r in _runs()]
    return {"items": items, "total": len(items)}


@app.get("/api/v1/orchestration/runs/{run_id}")
def run(run_id: str) -> dict:
    for r in _runs():
        if r["id"] == run_id:
            r["graph"] = graph_of(_bundle(r["spec_name"])).model_dump()
            return r
    raise HTTPException(404)


@app.get("/api/v1/orchestration/insights")
def insights() -> dict:
    runs_ = [r for r in _runs() if r["status"] == "done"]
    gates = [
        {"run_id": r["id"], "round": e["detail"].get("round", 0), "passed": bool(e["detail"].get("passed")),
         "failures": e["detail"].get("failures", []), "metrics": e["detail"].get("metrics", {})}
        for r in runs_ for e in r["events"] if e["kind"] == "gate_checked"
    ]  # fmt: skip
    return Insights.model_validate(build_insights([{"id": r["id"], "metrics": r["metrics"]} for r in runs_], gates, [])).model_dump()
