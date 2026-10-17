"""Build a research report: outline → authoritative search → per-section data, text and checks → summary.

The model plans, extracts and writes; code decides what may stay: data points must quote their source
verbatim, every claim is graded against its sources (see ``audit``), and numbers in the text that occur in
no source are listed as caveats.
"""

from __future__ import annotations

import logging
import re
from collections import Counter
from collections.abc import Awaitable, Callable
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from app.core.config import settings
from app.core.llm_runtime import current_llm
from app.services.research.audit import (
    LEVEL_LABELS,
    AuditedClaim,
    audit_claims,
    corroboration_query,
    extract_claims,
)
from app.services.research.corpus import WebCorpus, format_evidence
from app.services.research.exceptions import WebSearchError
from app.services.research.facade import ResearchService
from app.services.research.models import WebSource
from app.services.research.report_data import (
    data_table,
    display_value,
    trend_chart,
    unsupported_numbers,
    verify_data_points,
)
from app.services.research.report_llm import (
    extract_data_points,
    plan_outline,
    write_section,
    write_summary,
)
from app.services.research.report_models import (
    OutlineSection,
    ReportMethod,
    ReportSection,
    ResearchReport,
)

logger = logging.getLogger(__name__)

Progress = Callable[[str, int], Awaitable[None]]
_QUERY_BATCH = 4


class _TraceLog:
    """Collects the research trace (pages read, queries) for the method appendix."""

    def __init__(self) -> None:
        self.pages: list[dict[str, Any]] = []

    async def trace(self, event: dict[str, Any]) -> None:
        if event.get("step") == "web_fetch":
            self.pages.extend(event["detail"].get("pages") or [])

    async def sources(self, queries: list[str], sources: list[WebSource]) -> None:
        return None

    async def draft(self, text: str) -> None:
        return None


class ReportBuilder:
    def __init__(self, research: ResearchService) -> None:
        self._research = research

    async def build(self, topic: str, progress: Progress) -> ResearchReport:
        started = _now()
        await progress("规划报告提纲", 3)
        outline = await plan_outline(topic, max_sections=settings.REPORT_MAX_SECTIONS)
        queries = list(
            dict.fromkeys(q.strip() for s in outline.sections for q in s.queries if q.strip())
        )[: settings.REPORT_MAX_QUERIES] or [topic]
        log = _TraceLog()
        corpus = self._research.new_corpus()
        try:
            await self._search(queries, corpus, log, progress)
            sections: list[ReportSection] = []
            kept_total = rejected_total = 0
            used: list[str] = []
            for i, planned in enumerate(outline.sections):
                await progress(
                    f"撰写并核对：{planned.heading}", 45 + int(35 * i / len(outline.sections))
                )
                section, kept, rejected = await self._section(outline.title, planned, corpus, used)
                sections.append(section)
                used.extend(
                    f"{p.indicator}（{p.period}）{display_value(p)}" for p in section.data_points
                )
                kept_total += kept
                rejected_total += rejected
            await progress("为存疑的说法补找权威来源", 82)
            queries += await self._corroborate(outline.sections, sections, corpus, log)
            await progress("撰写核心结论", 88)
            summary, summary_claims = await self._summary(outline.title, sections, corpus)
            await progress("整理核实情况", 96)
            consistent_claims(sections, summary_claims)
            sources = corpus.sources
            return ResearchReport(
                title=outline.title,
                topic=topic,
                generated_at=_now(),
                summary=summary,
                summary_claims=summary_claims,
                sections=sections,
                caveats=_caveats(sections, summary_claims, sources),
                method=ReportMethod(
                    queries=queries,
                    pages_read=len(log.pages),
                    full_text_pages=sum(1 for p in log.pages if p.get("full_text")),
                    sources_by_tier=dict(Counter(s.tier for s in _unique_pages(sources))),
                    data_points_kept=kept_total,
                    data_points_rejected=rejected_total,
                    model=current_llm().model,
                    started_at=started,
                    finished_at=_now(),
                ),
                sources=sources,
            )
        finally:
            try:
                await corpus.close()
            except Exception:
                logger.warning("report_collection_cleanup_failed", exc_info=True)

    async def _search(
        self, queries: list[str], corpus: WebCorpus, log: _TraceLog, progress: Progress
    ) -> None:
        batches = [queries[i : i + _QUERY_BATCH] for i in range(0, len(queries), _QUERY_BATCH)]
        failures = 0
        for n, batch in enumerate(batches):
            await progress(
                f"搜索并阅读权威资料（{n + 1}/{len(batches)}）", 8 + int(35 * n / len(batches))
            )
            try:
                await self._research.gather(
                    batch, corpus, log, round_=n, max_pages=settings.REPORT_PAGES_PER_BATCH
                )
            except WebSearchError:
                failures += 1
                logger.warning("report_search_batch_failed batch=%s", batch, exc_info=True)
        if failures == len(batches):
            raise WebSearchError(
                message="网页搜索暂时不可用，请稍后再试", details={"queries": queries}
            )
        if not log.pages:
            raise WebSearchError(
                message="没有搜到可以读取的网页，换个说法再试试", details={"queries": queries}
            )

    async def _corroborate(
        self,
        planned: list[OutlineSection],
        sections: list[ReportSection],
        corpus: WebCorpus,
        log: _TraceLog,
    ) -> list[str]:
        """One bounded round: search for independent, official sources on weak claims, then grade again."""
        weak = [
            (i, claim)
            for i, section in enumerate(sections)
            for claim in section.claims
            if claim.level in ("disputed", "single_source")
        ]
        # Disputed first, then claims carrying numbers: those are what a reader will check.
        weak.sort(
            key=lambda item: (item[1].level != "disputed", not re.search(r"\d", item[1].claim))
        )
        weak = weak[: settings.REPORT_MAX_CORROBORATED_CLAIMS]
        if not weak:
            return []
        searches = list(dict.fromkeys(corroboration_query(claim) for _, claim in weak))
        try:
            await self._research.gather(
                searches, corpus, log, round_=99, max_pages=settings.REPORT_PAGES_PER_BATCH
            )
        except WebSearchError:
            logger.warning("report_corroboration_search_failed", exc_info=True)
            return searches
        extra: dict[int, list[WebSource]] = {}
        for i, claim in weak:
            extra.setdefault(i, []).extend(await corpus.retrieve(claim.claim, limit=4))
        by_index = {s.index: s for s in corpus.sources}
        for i, found in extra.items():
            section = sections[i]
            sources = list(
                {s.index: s for s in [*_cited_sources(section.body, by_index), *found]}.values()
            )
            regraded = await self._grade(planned[i].goal, section.body, sources)
            if regraded:
                section.claims = regraded
        return searches

    async def _section(
        self, title: str, planned: OutlineSection, corpus: WebCorpus, used: list[str]
    ) -> tuple[ReportSection, int, int]:
        await corpus.retrieve(
            f"{planned.heading} {planned.goal}", limit=settings.REPORT_SECTION_EVIDENCE
        )
        for indicator in planned.indicators:
            await corpus.retrieve(indicator, limit=3)
        relevant = _relevant_sources(
            corpus.sources, planned, limit=settings.REPORT_SECTION_EVIDENCE + 6
        )
        evidence = format_evidence(relevant)
        by_index = {s.index: s for s in corpus.sources}
        try:
            raw = await extract_data_points(planned, evidence, already_used=used)
        except Exception:
            logger.warning("report_data_extraction_failed", exc_info=True)
            raw = []
        data, rejected = verify_data_points(raw, by_index)
        body, analysis = await write_section(title, planned, evidence, data)
        cited = _cited_sources(body, by_index) or relevant
        claims = await self._grade(planned.goal, body, cited)
        return (
            ReportSection(
                heading=planned.heading,
                body=body or "公开资料中没有找到足够的信息来撰写这一部分。",
                analysis=analysis,
                data_points=data,
                table=data_table(planned.heading, data),
                chart=trend_chart(data),
                claims=claims,
            ),
            len(data),
            rejected,
        )

    async def _summary(
        self, title: str, sections: list[ReportSection], corpus: WebCorpus
    ) -> tuple[str, list[AuditedClaim]]:
        by_index = {s.index: s for s in corpus.sources}
        texts = [(s.heading, s.body) for s in sections]
        cited = _cited_sources("\n".join(s.body for s in sections), by_index)
        summary = await write_summary(title, texts, format_evidence(cited))
        return summary, await self._grade(
            title, summary, _cited_sources(summary, by_index) or cited
        )

    async def _grade(
        self, question: str, text: str, sources: list[WebSource]
    ) -> list[AuditedClaim]:
        if not text.strip() or not sources:
            return []
        try:
            extracted = await extract_claims(question, text, format_evidence(sources))
        except Exception:
            logger.warning("report_claim_extraction_failed", exc_info=True)
            return []
        today = datetime.now(ZoneInfo(settings.TIMEZONE)).date()
        return audit_claims(
            extracted, sources, today=today, stale_days=settings.RESEARCH_STALE_DAYS
        ).claims


_LEVEL_STRENGTH = {"verified": 0, "single_source": 1, "disputed": 2, "unverified": 3}
_NUMBERS = re.compile(r"\d+(?:\.\d+)?")
_TOKENS = re.compile(r"[\u4e00-\u9fff]|[a-z]+")


def _same_claim(a: str, b: str) -> bool:
    """Same numbers and mostly the same wording: the same statement made in two sections."""
    if set(_NUMBERS.findall(a)) != set(_NUMBERS.findall(b)):
        return False
    ta, tb = set(_TOKENS.findall(a.lower())), set(_TOKENS.findall(b.lower()))
    return bool(ta and tb) and len(ta & tb) / min(len(ta), len(tb)) >= 0.8


def consistent_claims(sections: list[ReportSection], summary_claims: list[AuditedClaim]) -> None:
    """Give a statement made in several places its best-supported grading everywhere."""
    groups: list[list[AuditedClaim]] = []
    for claim in [*summary_claims, *(c for s in sections for c in s.claims)]:
        for group in groups:
            if _same_claim(group[0].claim, claim.claim):
                group.append(claim)
                break
        else:
            groups.append([claim])
    for group in groups:
        best = min(group, key=lambda c: _LEVEL_STRENGTH[c.level])
        for claim in group:
            if _LEVEL_STRENGTH[claim.level] > _LEVEL_STRENGTH[best.level]:
                for field in (
                    "level",
                    "supported",
                    "citation_indices",
                    "contradicting",
                    "domains",
                    "stale",
                ):
                    setattr(claim, field, getattr(best, field))
                claim.reason = f"{best.reason}（与报告其他部分的同一说法一致）"


def _now() -> str:
    return datetime.now(ZoneInfo(settings.TIMEZONE)).isoformat(timespec="seconds")


def _cited_sources(text: str, by_index: dict[int, WebSource]) -> list[WebSource]:
    numbers = dict.fromkeys(int(n) for n in re.findall(r"\[(\d+)\]", text))
    return [by_index[n] for n in numbers if n in by_index]


def _relevant_sources(
    sources: list[WebSource], planned: OutlineSection, *, limit: int
) -> list[WebSource]:
    """Passages sharing the most terms with this section, most credible first among equals."""
    terms = set(
        re.findall(
            r"[一-鿿]{2}|[a-z0-9]+",
            f"{planned.heading}{planned.goal}{''.join(planned.indicators)}".lower(),
        )
    )
    tier_rank = {"authoritative": 0, "reference": 1, "general": 2, "low": 3}

    def score(source: WebSource) -> tuple[int, int]:
        text = source.content.lower()
        return (-sum(t in text for t in terms), tier_rank.get(source.tier, 2))

    ranked = sorted(sources, key=score)[:limit]
    return sorted(ranked, key=lambda s: s.index)


def _unique_pages(sources: list[WebSource]) -> list[WebSource]:
    return list({s.url: s for s in sources}.values())


def _caveats(
    sections: list[ReportSection], summary_claims: list[AuditedClaim], sources: list[WebSource]
) -> list[str]:
    notes: list[str] = []
    evidence = "\n".join(s.content for s in sources)
    for section in sections:
        for claim in section.claims:
            if claim.level in ("disputed", "unverified") or claim.stale:
                label = (
                    "可能过时"
                    if claim.stale and claim.level == "verified"
                    else LEVEL_LABELS[claim.level]
                )
                notes.append(f"【{section.heading}】{label}：{claim.claim}（{claim.reason}）")
        missing = unsupported_numbers(f"{section.body}\n{section.analysis}", evidence)
        if missing:
            notes.append(
                f"【{section.heading}】正文中的数字 {'、'.join(missing)} 在来源原文中没有找到，请谨慎使用"
            )
    for claim in summary_claims:
        if claim.level in ("disputed", "unverified"):
            notes.append(
                f"【核心结论】{LEVEL_LABELS[claim.level]}：{claim.claim}（{claim.reason}）"
            )
    return notes
