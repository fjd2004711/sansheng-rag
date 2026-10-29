"""The engine runs a workflow definition end to end with fake research and fake model calls (no network)."""

import asyncio
import time
from unittest.mock import AsyncMock, patch

import pytest

from app.services.orchestration.builtin import builtin_bundles
from app.services.orchestration.engine import OrchestrationEngine
from app.services.orchestration.spec import parse_bundle
from app.services.orchestration.verification import Diagnosis, GateSpec, diagnose, gate_check
from app.services.research import report_builder
from app.services.research.audit import AuditedClaim, ExtractedClaim
from app.services.research.report_models import (
    DataPoint,
    OutlineSection,
    ReportOutline,
    ReportSection,
)
from tests.test_research import FakeRetrieval
from tests.test_research_report import FakeResearch, _point

SECTION_TEXT = "2025届毕业生规模预计达1222万人 [1]。"


def _outline(n: int = 3) -> ReportOutline:
    return ReportOutline(
        title="2025届就业调研",
        sections=[
            OutlineSection(
                heading=f"章节{i}",
                goal="毕业生有多少",
                queries=[f"毕业生 规模 {i}"],
                indicators=["毕业生人数"],
            )
            for i in range(n)
        ],
    )


class Fakes:
    """Model-side doubles. ``repaired`` flips once a section is rewritten with the scope-first goal."""

    def __init__(self, *, weak_until_repaired: bool) -> None:
        self.weak_until_repaired = weak_until_repaired
        self.repaired = False
        self.section_calls = 0

    async def extract(self, section, evidence, *, already_used=None):
        return [_point("1222", "毕业生规模预计达1222万人")]

    async def write(self, topic, section, evidence, data):
        self.section_calls += 1
        if "全国" in section.goal:
            self.repaired = True
        await asyncio.sleep(0.25)
        return SECTION_TEXT, "规模扩大（推测）[1]。"

    async def claims(self, question, text, evidence, **kw):
        weak = self.weak_until_repaired and not self.repaired
        return [
            ExtractedClaim(claim="2025届毕业生规模预计达1222万人", supporting=[] if weak else [1])
        ]


def _patches(fakes: Fakes, outline: ReportOutline):
    return [
        patch.object(report_builder, "plan_outline", AsyncMock(return_value=outline)),
        patch.object(report_builder, "extract_data_points", fakes.extract),
        patch.object(report_builder, "write_section", fakes.write),
        patch.object(
            report_builder, "write_summary", AsyncMock(return_value="- 规模预计1222万人 [1]。")
        ),
        patch.object(
            report_builder,
            "write_synthesis",
            AsyncMock(return_value=("毕业生", "- 判断 [1]", [])),
        ),
        patch.object(report_builder, "extract_claims", fakes.claims),
    ]


async def _run(fakes: Fakes, outline: ReportOutline, bundle=None):
    bundle = bundle or builtin_bundles()["verified-report"]
    engine = OrchestrationEngine(research=FakeResearch(FakeRetrieval()))
    patches = _patches(fakes, outline)
    for p in patches:
        p.start()
    try:
        return await engine.execute(bundle, topic="大学生就业数据")
    finally:
        for p in patches:
            p.stop()


@pytest.mark.anyio
async def test_run_fans_sections_out_in_parallel_and_assembles_a_report() -> None:
    fakes = Fakes(weak_until_repaired=False)
    started = time.monotonic()
    outcome = await _run(fakes, _outline(3))
    assert outcome.status == "done", outcome.error
    report = outcome.result["report"]
    assert [s["heading"] for s in report["sections"]] == ["章节0", "章节1", "章节2"]
    # Three 0.25s section writers ran side by side (a serial run would need more than 0.75s for them alone).
    assert time.monotonic() - started < 3
    assert outcome.metrics["parallel_speedup"] > 1.2
    kinds = {e["kind"] for e in outcome.events}
    assert {"group_expanded", "task_start", "task_done", "gate_checked"} <= kinds
    gate = [e for e in outcome.events if e["kind"] == "gate_checked"]
    assert gate[0]["detail"]["passed"] and outcome.metrics["repair_rounds"] == 0


@pytest.mark.anyio
async def test_failed_gate_triggers_a_bounded_repair_round_that_fixes_it() -> None:
    fakes = Fakes(weak_until_repaired=True)
    outcome = await _run(fakes, _outline(2))
    assert outcome.status == "done", outcome.error
    gates = [e["detail"] for e in outcome.events if e["kind"] == "gate_checked"]
    assert gates[0]["passed"] is False and gates[0]["failures"]
    assert gates[-1]["passed"] is True
    assert outcome.metrics["repair_rounds"] == 1
    assert fakes.repaired  # the rewrite used the scope-first goal
    repair_tasks = [
        e["detail"]["task"]
        for e in outcome.events
        if e["kind"] == "task_start" and e["detail"]["task"].startswith("repair#r1")
    ]
    assert any(t.endswith(":search") for t in repair_tasks) and any(
        "rewrite" in t for t in repair_tasks
    )


@pytest.mark.anyio
async def test_a_repair_round_that_changes_nothing_stops_the_loop_and_is_disclosed() -> None:
    class NeverFixed(Fakes):
        async def claims(self, question, text, evidence, **kw):
            return [ExtractedClaim(claim="2025届毕业生规模预计达1222万人", supporting=[])]

    outcome = await _run(NeverFixed(weak_until_repaired=True), _outline(1))
    assert (
        outcome.status == "done"
    )  # an unfixable draft is still delivered, with its problems visible
    kinds = [e["kind"] for e in outcome.events]
    assert "repair_stalled" in kinds
    # One repair round, then the stall check stops it well before the policy cap of 2 rounds.
    assert outcome.metrics["repair_rounds"] == 1
    gates = [e["detail"] for e in outcome.events if e["kind"] == "gate_checked"]
    assert len(gates) == 2 and not gates[-1]["passed"]
    assert any("没有提升" in c for c in outcome.result["report"]["caveats"])


@pytest.mark.anyio
async def test_a_rewrite_that_is_worse_than_the_draft_is_rejected_and_the_gap_is_disclosed() -> (
    None
):
    class Regresses(Fakes):
        """A verified draft that only has single-school data (scope gap); every rewrite loses its support."""

        async def extract(self, section, evidence, *, already_used=None):
            point = _point("1222", "毕业生规模预计达1222万人")
            return [point.model_copy(update={"scope": "武汉商学院"})]

        async def claims(self, question, text, evidence, **kw):
            return [
                ExtractedClaim(
                    claim="2025届毕业生规模预计达1222万人", supporting=[] if self.repaired else [1]
                )
            ]

    outcome = await _run(Regresses(weak_until_repaired=False), _outline(1))
    assert outcome.status == "done", outcome.error
    kinds = [e["kind"] for e in outcome.events]
    assert "repair_rejected" in kinds and "repair_accepted" not in kinds
    section = outcome.result["report"]["sections"][0]
    assert section["claims"][0]["level"] == "verified"  # the better original draft was kept
    assert (
        "不代表全国" in section["body"]
    )  # the scope gap the loop could not close is stated in the text


@pytest.mark.anyio
async def test_a_dead_model_falls_back_and_the_run_still_finishes() -> None:
    fakes = Fakes(weak_until_repaired=False)
    base = builtin_bundles()["verified-report"]
    bundle = base.model_copy(deep=True)
    bundle.workflow.policy.fallback_models = ["backup-model"]
    calls = {"n": 0}
    real_write = fakes.write

    async def flaky_write(topic, section, evidence, data):
        from app.core.llm_runtime import current_llm

        calls["n"] += 1
        if current_llm().model != "backup-model":
            raise RuntimeError("Error code: 403 insufficient_quota Free quota exhausted")
        return await real_write(topic, section, evidence, data)

    fakes.write = flaky_write  # type: ignore[method-assign]
    outcome = await _run(fakes, _outline(2), bundle)
    assert outcome.status == "done", outcome.error
    assert outcome.metrics["model_switches"][0]["to"] == "backup-model"
    assert any(e["kind"] == "model_fallback" for e in outcome.events)


@pytest.mark.anyio
async def test_search_outage_fails_the_run_with_a_readable_error() -> None:
    class Dead(FakeResearch):
        async def gather(self, queries, corpus, events, *, round_, max_pages=None) -> None:
            from app.services.research.exceptions import WebSearchError

            raise WebSearchError(message="down", details={})

    fakes = Fakes(weak_until_repaired=False)
    engine = OrchestrationEngine(research=Dead(FakeRetrieval()))
    patches = _patches(fakes, _outline(1))
    for p in patches:
        p.start()
    try:
        outcome = await engine.execute(builtin_bundles()["verified-report"], topic="x")
    finally:
        for p in patches:
            p.stop()
    assert outcome.status == "failed" and "搜索" in (outcome.error or "")


# ---- definitions and verification are plain functions ---------------------------------------------------------


def test_workflow_definition_rejects_cycles_unknown_agents_and_peeking_verifiers() -> None:
    from app.services.orchestration.builtin import REPORT_YAML
    from app.services.orchestration.exceptions import SpecError

    for bad in (
        REPORT_YAML.replace(
            "depends_on: [plan], map_over: query_batches",
            "depends_on: [synthesis], map_over: query_batches",
        ),
        REPORT_YAML.replace("agent: repairer, essential", "agent: ghost, essential"),
        REPORT_YAML.replace("can_see: [draft, evidence]\n", "can_see: [draft, reasoning]\n", 1),
    ):
        with pytest.raises(SpecError):
            parse_bundle(bad)
    assert parse_bundle(REPORT_YAML).workflow.name == "verified-report"


def _claim(level: str, text: str = "规模1222万人", cites=(1,)) -> AuditedClaim:
    return AuditedClaim(
        claim=text,
        level=level,
        supported=level == "verified",
        citation_indices=list(cites),
        contradicting=[],
        domains=[],
        reason="",
    )


def test_diagnose_flags_single_school_scope_and_gate_check_reports_why() -> None:
    from app.services.research.models import WebSource

    source = WebSource(
        index=1,
        title="t",
        url="https://www.moe.gov.cn/a",
        domain="moe.gov.cn",
        content="规模1222万人",
        fetched_at="",
        tier="authoritative",
    )
    narrow = ReportSection(
        heading="落实率",
        body="武汉商学院落实率90.66% [1]。",
        data_points=[
            DataPoint(
                indicator="落实率",
                value="90.66",
                unit="%",
                period="2025届",
                scope="武汉商学院",
                source=1,
                quote="x",
            )
        ],
        claims=[_claim("single_source", "某校落实率90.66%")],
    )
    broad = narrow.model_copy(
        update={"data_points": [narrow.data_points[0].model_copy(update={"scope": "全国普通高校"})]}
    )
    d = diagnose([narrow], [source], topic="2025届大学生就业")
    assert {f.type for f in d.failures} >= {"scope_misplaced", "weak_evidence"}
    assert "scope_misplaced" not in {
        f.type for f in diagnose([broad], [source], topic="2025届大学生就业").failures
    }
    # A topic about one school is not a scope error.
    assert "scope_misplaced" not in {
        f.type for f in diagnose([narrow], [source], topic="武汉商学院就业").failures
    }
    ok, reasons = gate_check(GateSpec(require_scope_disclosed=True, min_verified_ratio=0.5), d)
    assert not ok and len(reasons) == 2
    assert gate_check(GateSpec(), Diagnosis())[0]
