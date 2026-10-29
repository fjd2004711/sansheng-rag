"""Skills: what each agent actually does. A skill reads and writes the shared run state; the engine decides when."""

from __future__ import annotations

import asyncio
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from app.core.config import settings
from app.services.orchestration.spec import AgentSpec, Bundle, NodeSpec
from app.services.orchestration.state import RunState
from app.services.orchestration.verification import (
    FAILURE_LABELS,
    SCOPE_DISCLOSURE,
    Diagnosis,
    Failure,
    diagnose,
    gate_check,
    is_narrow_scope,
)
from app.services.research.audit import audit_claims, extract_claims
from app.services.research.corpus import format_evidence
from app.services.research.exceptions import WebSearchError
from app.services.research.report_builder import (
    LEVEL_STRENGTH,
    ReportBuilder,
    cited_sources,
    same_claim,
)
from app.services.research.report_models import OutlineSection

_QUERY_BATCH = 4
_REPAIR_QUERIES_PER_SECTION = 2


@dataclass
class SkillCtx:
    bundle: Bundle
    node: NodeSpec
    agent: AgentSpec
    state: RunState
    builder: ReportBuilder
    emit: Callable[[str, dict[str, Any]], Awaitable[None]]
    run_group: Callable[
        ..., Awaitable[bool]
    ]  # inserts a group into the running scheduler and waits for it
    make_task: Callable[..., Any]
    make_group: Callable[..., Any]


Skill = Callable[[SkillCtx, Any], Awaitable[Any]]
SKILLS: dict[str, Skill] = {}


def skill(name: str) -> Callable[[Skill], Skill]:
    def register(fn: Skill) -> Skill:
        SKILLS[name] = fn
        return fn

    return register


# ---- expanders: what a map node fans out over -------------------------------------------------------------


def expand_items(state: RunState, map_over: str) -> list[Any]:
    if map_over == "query_batches":
        q = state.queries
        return [q[i : i + _QUERY_BATCH] for i in range(0, len(q), _QUERY_BATCH)]
    if map_over == "sections":
        return list(range(len(state.outline.sections))) if state.outline else []
    raise ValueError(f"未知的 map_over：{map_over}")


def item_label(state: RunState, map_over: str, item: Any) -> str:
    if map_over == "sections" and state.outline:
        return state.outline.sections[item].heading
    if map_over == "query_batches":
        return "、".join(item)[:40]
    return str(item)


# ---- report scenario -----------------------------------------------------------------------------------


@skill("plan_outline")
async def plan_outline(ctx: SkillCtx, _item: Any) -> dict[str, Any]:
    st = ctx.state
    st.outline, st.queries = await ctx.builder.plan(st.topic)
    st.corpus = ctx.builder.new_corpus()
    return {
        "title": st.outline.title,
        "sections": len(st.outline.sections),
        "queries": len(st.queries),
    }


@skill("search_web")
async def search_web(ctx: SkillCtx, batch: list[str]) -> dict[str, Any]:
    st = ctx.state
    assert st.corpus is not None
    ok = await ctx.builder.search_batch(batch, st.corpus, st.log, round_=len(st.log.pages))
    if not ok:
        await ctx.emit("search_batch_failed", {"queries": batch})
    return {"ok": ok, "pages": len(st.log.pages)}


@skill("write_section")
async def write_section(ctx: SkillCtx, idx: int) -> dict[str, Any]:
    st = ctx.state
    assert st.outline is not None and st.corpus is not None
    if idx == 0 and not st.log.pages:
        raise WebSearchError(
            message="没有搜到可以读取的网页，换个说法再试试", details={"queries": st.queries}
        )
    planned = st.outline.sections[idx]
    section, kept, rejected = await ctx.builder.section(st.outline.title, planned, st.corpus, [])
    st.sections[idx], st.kept[idx], st.rejected[idx] = section, kept, rejected
    return {"claims": len(section.claims), "data_points": kept}


async def verify_one(ctx: SkillCtx, idx: int) -> int:
    """The verifier retrieves its own evidence and re-grades the draft; a downgrade overrules the writer's grading.

    It sees only the draft text and the corpus, never how the writer got there, so the check is independent of the
    executor. Returns how many claims it downgraded.
    """
    st = ctx.state
    assert st.corpus is not None
    section = st.sections[idx]
    own = await st.corpus.retrieve(f"{section.heading} {section.body[:120]}", limit=6)
    by_index = {s.index: s for s in st.corpus.sources}
    pool = {s.index: s for s in [*cited_sources(section.body, by_index), *own]}
    fresh = await ctx.builder.grade(section.heading, section.body, list(pool.values()))
    downgraded = 0
    for new in fresh:
        old = next((c for c in section.claims if same_claim(c.claim, new.claim)), None)
        if old is not None and LEVEL_STRENGTH[new.level] > LEVEL_STRENGTH[old.level]:
            for field in (
                "level",
                "supported",
                "citation_indices",
                "contradicting",
                "domains",
                "stale",
            ):
                setattr(old, field, getattr(new, field))
            old.reason = f"独立核查员复核后下调：{new.reason}"
            downgraded += 1
    st.overturned += downgraded
    return downgraded


@skill("verify_report")
async def verify_report(ctx: SkillCtx, idx: int) -> dict[str, Any]:
    n = await verify_one(ctx, idx)
    if n:
        await ctx.emit(
            "verifier_overturned", {"section": ctx.state.sections[idx].heading, "claims": n}
        )
    return {"downgraded": n}


def _national_goal(planned: OutlineSection) -> OutlineSection:
    goal = (
        planned.goal.rstrip("。")
        + "；优先采用全国或总体口径的权威发布数据，单个学校、单个地区的数据必须写明范围且不得当作整体结论"
    )
    queries = [f"{q} 全国 官方发布" for q in planned.queries[:1]] + planned.queries
    return planned.model_copy(update={"goal": goal, "queries": list(dict.fromkeys(queries))[:3]})


@skill("repair_report")
async def repair_report(ctx: SkillCtx, idx: int) -> dict[str, Any]:
    """Rewrite one failing section with a scope-first goal on top of the enlarged corpus, then re-verify it."""
    st = ctx.state
    assert st.outline is not None and st.corpus is not None
    planned = _national_goal(st.outline.sections[idx])
    section, kept, rejected = await ctx.builder.section(st.outline.title, planned, st.corpus, [])
    st.sections[idx], st.kept[idx], st.rejected[idx] = section, kept, rejected
    st.outline.sections[idx] = planned
    await verify_one(ctx, idx)
    return {"claims": len(section.claims)}


def repair_queries(state: RunState, failures_by_section: dict[int, list[Failure]]) -> list[str]:
    assert state.outline is not None
    out: list[str] = []
    for idx in failures_by_section:
        planned = state.outline.sections[idx]
        for indicator in planned.indicators[:_REPAIR_QUERIES_PER_SECTION]:
            out.append(f"{state.topic} {indicator} 全国 官方发布")
    return list(dict.fromkeys(out))


def current_diagnosis(ctx: SkillCtx) -> Diagnosis:
    st = ctx.state
    assert st.corpus is not None
    return diagnose(st.ordered_sections(), st.corpus.sources, topic=st.topic)


async def run_gate(
    ctx: SkillCtx, repair_agent: AgentSpec | None, max_rounds: int
) -> dict[str, Any]:
    """Check the draft against the gate; on failure diagnose, repair by failure type, re-check. Bounded by rounds."""
    st = ctx.state
    gate = ctx.node.gate
    assert gate is not None and st.outline is not None and st.corpus is not None
    history: list[dict[str, Any]] = []
    for round_ in range(max_rounds + 1):
        diag = current_diagnosis(ctx)
        passed, reasons = gate_check(gate, diag)
        history.append(
            {"round": round_, "passed": passed, "metrics": diag.metrics, "reasons": reasons}
        )
        await ctx.emit(
            "gate_checked",
            {
                "round": round_,
                "passed": passed,
                "metrics": diag.metrics,
                "reasons": reasons,
                "failures": [
                    {
                        "section": st.outline.sections[f.section].heading,
                        "type": f.type,
                        "label": FAILURE_LABELS[f.type],
                        "detail": f.detail,
                    }
                    for f in diag.failures
                ],
            },
        )
        if passed or round_ == max_rounds or repair_agent is None:
            break
        by_section = diag.by_section()
        # Failure type decides the repair: weak or authority-less evidence needs more sources first; every failing
        # section is then rewritten on the enlarged corpus (scope-first), and re-verified inside the same task.
        queries = repair_queries(st, by_section)
        group_id = f"repair#r{round_ + 1}"
        search_tasks = []
        if queries:
            search_tasks.append(
                ctx.make_task(
                    f"{group_id}:search",
                    f"{group_id}:search",
                    lambda q=queries, r=round_: _repair_search(ctx, q, r),
                    label="定向补检索（全国口径、官方发布）",
                    pool="search",
                    essential=False,
                )
            )
        search_group = ctx.make_group(f"{group_id}:search", tasks=search_tasks)
        await ctx.run_group(search_group)
        rewrite_tasks = [
            ctx.make_task(
                f"{group_id}:rewrite#{idx}",
                f"{group_id}:rewrite",
                (lambda i=idx: _rewrite(ctx, i)),
                label=f"重写并复核：{st.outline.sections[idx].heading}",
                pool="llm",
                essential=False,
            )
            for idx in by_section
        ]
        await ctx.run_group(ctx.make_group(f"{group_id}:rewrite", tasks=rewrite_tasks))
        st.repairs.append(
            {
                "round": round_ + 1,
                "sections": [st.outline.sections[i].heading for i in by_section],
                "types": sorted({f.type for fs in by_section.values() for f in fs}),
            }
        )
    # What the loop could not fix is disclosed, never hidden.
    final = current_diagnosis(ctx)
    for f in final.failures:
        section = st.sections[f.section]
        if f.type == "scope_misplaced":
            section.body = f"{section.body.rstrip()}\n\n{SCOPE_DISCLOSURE}"
            st.notes.append(
                f"【{section.heading}】只找到个别学校/地区的数据，已在正文标注“不代表整体”"
            )
        elif f.type == "unsupported_number":
            st.notes.append(f"【{section.heading}】仍有数字在来源中找不到：{f.detail}")
    return {"history": history, "passed": history[-1]["passed"], "rounds": len(history) - 1}


async def _repair_search(ctx: SkillCtx, queries: list[str], round_: int) -> dict[str, Any]:
    st = ctx.state
    assert st.corpus is not None and st.outline is not None
    ok = await ctx.builder.search_batch(queries[:6], st.corpus, st.log, round_=200 + round_)
    weak_queries = await ctx.builder.corroborate(
        st.outline.sections, st.ordered_sections(), st.corpus, st.log
    )
    st.queries.extend(queries)
    st.queries.extend(weak_queries)
    return {"ok": ok, "queries": len(queries) + len(weak_queries)}


async def _rewrite(ctx: SkillCtx, idx: int) -> dict[str, Any]:
    return await repair_report(ctx, idx)


@skill("write_synthesis")
async def write_synthesis(ctx: SkillCtx, _item: Any) -> dict[str, Any]:
    st = ctx.state
    assert st.outline is not None and st.corpus is not None
    sections = st.ordered_sections()
    (st.summary, st.summary_claims), st.synthesis = await asyncio.gather(
        ctx.builder.summary(st.outline.title, sections, st.corpus),
        ctx.builder.synthesis(st.outline.title, sections, st.corpus),
    )
    return {"recommendations": len(st.synthesis[3])}


@skill("assemble_report")
async def assemble_report(ctx: SkillCtx, _item: Any) -> dict[str, Any]:
    st = ctx.state
    assert st.outline is not None and st.corpus is not None
    started = datetime.now(ZoneInfo(settings.TIMEZONE)).isoformat(timespec="seconds")
    report = ctx.builder.assemble(
        outline=st.outline,
        topic=st.topic,
        queries=st.queries,
        sections=st.ordered_sections(),
        summary=st.summary,
        summary_claims=st.summary_claims,
        synthesis=st.synthesis,  # type: ignore[arg-type]
        corpus=st.corpus,
        log=st.log,
        kept=sum(st.kept.values()),
        rejected=sum(st.rejected.values()),
        started_at=started,
        notes=st.notes,
    )
    st.result = {"kind": "report", "report": report.model_dump(mode="json")}
    return {"title": report.title}


# ---- fact-check scenario (same platform, different team and workflow) -----------------------------------------


def _claim_query(text: str) -> str:
    text = re.sub(r"[，。；：、“”‘’（）()\"'!?！？,;:]", " ", text)
    text = " ".join(text.split())[:40]
    return f"{text} 官方" if re.search(r"[一-鿿]", text) else f"{text} official"


@skill("extract_input_claims")
async def extract_input_claims(ctx: SkillCtx, _item: Any) -> dict[str, Any]:
    st = ctx.state
    text = str(st.input.get("text") or st.topic)
    st.corpus = ctx.builder.new_corpus()
    st.claims_input = await extract_claims("请核查这段文字", text, "")
    st.queries = [_claim_query(c.claim) for c in st.claims_input][:8]
    return {"claims": len(st.claims_input)}


@skill("search_claims")
async def search_claims(ctx: SkillCtx, _item: Any) -> dict[str, Any]:
    st = ctx.state
    assert st.corpus is not None
    for i in range(0, len(st.queries), _QUERY_BATCH):
        await ctx.builder.search_batch(
            st.queries[i : i + _QUERY_BATCH], st.corpus, st.log, round_=i
        )
    return {"pages": len(st.log.pages)}


@skill("verify_claims")
async def verify_claims(ctx: SkillCtx, _item: Any) -> dict[str, Any]:
    st = ctx.state
    assert st.corpus is not None
    text = str(st.input.get("text") or st.topic)
    found = []
    for claim in st.claims_input:
        found.extend(await st.corpus.retrieve(claim.claim, limit=4))
    sources = list({s.index: s for s in found}.values()) or st.corpus.sources
    extracted = await extract_claims("请核查这段文字", text, format_evidence(sources))
    today = datetime.now(ZoneInfo(settings.TIMEZONE)).date()
    st.graded = audit_claims(
        extracted, sources, today=today, stale_days=settings.RESEARCH_STALE_DAYS
    ).claims
    return {"claims": len(st.graded)}


@skill("assemble_fact_check")
async def assemble_fact_check(ctx: SkillCtx, _item: Any) -> dict[str, Any]:
    st = ctx.state
    assert st.corpus is not None
    st.result = {
        "kind": "fact_check",
        "text": str(st.input.get("text") or st.topic),
        "claims": [c.model_dump(mode="json") for c in st.graded],
        "sources": [s.model_dump(mode="json") for s in st.corpus.sources],
    }
    return {"claims": len(st.graded)}


__all__ = ["SKILLS", "SkillCtx", "expand_items", "is_narrow_scope", "item_label", "run_gate"]
