"""Build a research report: outline → authoritative search → per-section data, text and checks → summary.

The model plans, extracts and writes; code decides what may stay: data points must quote their source
verbatim, every claim is graded against its sources (see ``audit``), and numbers in the text that occur in
no source are listed as caveats.
"""

from __future__ import annotations

import asyncio
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
    recheck_support,
)
from app.services.research.authorities import with_official_variants
from app.services.research.corpus import WebCorpus, format_evidence
from app.services.research.exceptions import WebSearchError
from app.services.research.facade import ResearchService
from app.services.research.models import WebSource
from app.services.research.report_data import (
    data_table,
    display_value,
    scrub_unsupported_sentences,
    trend_chart,
    unsupported_numbers,
    verify_data_points,
)
from app.services.research.report_llm import (
    extract_data_points,
    plan_outline,
    write_section,
    write_summary,
    write_synthesis,
)
from app.services.research.report_models import (
    OutlineSection,
    Recommendation,
    ReportMethod,
    ReportOutline,
    ReportSection,
    ResearchReport,
)

logger = logging.getLogger(__name__)

Progress = Callable[[str, int], Awaitable[None]]
_QUERY_BATCH = 4


class TraceLog:
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

    async def plan(self, topic: str) -> tuple[ReportOutline, list[str]]:
        """The outline and the search queries (planned ones plus official-site variants)."""
        outline = await plan_outline(topic, max_sections=settings.REPORT_MAX_SECTIONS)
        planned_queries = list(
            dict.fromkeys(q.strip() for s in outline.sections for q in s.queries if q.strip())
        )
        queries = with_official_variants(planned_queries, limit=settings.REPORT_MAX_QUERIES) or [
            topic
        ]
        return outline, queries

    async def build(self, topic: str, progress: Progress) -> ResearchReport:
        started = _now()
        await progress("规划报告提纲", 3)
        outline, queries = await self.plan(topic)
        log = TraceLog()
        corpus = self._research.new_corpus()
        try:
            await self.search(queries, corpus, log, progress)
            sections: list[ReportSection] = []
            kept_total = rejected_total = 0
            used: list[str] = []
            for i, planned in enumerate(outline.sections):
                await progress(
                    f"撰写并核对：{planned.heading}", 45 + int(35 * i / len(outline.sections))
                )
                section, kept, rejected = await self.section(outline.title, planned, corpus, used)
                sections.append(section)
                used.extend(
                    f"{p.indicator}（{p.period}）{display_value(p)}" for p in section.data_points
                )
                kept_total += kept
                rejected_total += rejected
            await progress("为存疑的说法补找权威来源", 82)
            queries += await self.corroborate(outline.sections, sections, corpus, log)
            await progress("撰写核心结论", 88)
            summary, summary_claims = await self.summary(outline.title, sections, corpus)
            await progress("撰写综合研判与行动建议", 92)
            synthesis = await self.synthesis(outline.title, sections, corpus)
            await progress("整理核实情况", 96)
            return self.assemble(
                outline=outline,
                topic=topic,
                queries=queries,
                sections=sections,
                summary=summary,
                summary_claims=summary_claims,
                synthesis=synthesis,
                corpus=corpus,
                log=log,
                kept=kept_total,
                rejected=rejected_total,
                started_at=started,
            )
        finally:
            try:
                await corpus.close()
            except Exception:
                logger.warning("report_collection_cleanup_failed", exc_info=True)

    def assemble(
        self,
        *,
        outline: ReportOutline,
        topic: str,
        queries: list[str],
        sections: list[ReportSection],
        summary: str,
        summary_claims: list[AuditedClaim],
        synthesis: tuple[str, str, list[AuditedClaim], list[Recommendation]],
        corpus: WebCorpus,
        log: TraceLog,
        kept: int,
        rejected: int,
        started_at: str,
        notes: list[str] | None = None,
    ) -> ResearchReport:
        """Final grading consistency, caveats and the method appendix. ``notes`` are run-level disclosures."""
        audience, insights, insight_claims, recommendations = synthesis
        premises = [c for r in recommendations for c in r.premises]
        consistent_claims(sections, [*summary_claims, *insight_claims, *premises])
        for rec in recommendations:
            rec.basis = _basis(rec.premises, rec.reason)
        sources = corpus.sources
        return ResearchReport(
            title=outline.title,
            topic=topic,
            generated_at=_now(),
            summary=summary,
            summary_claims=summary_claims,
            audience=audience,
            insights=insights,
            insight_claims=insight_claims,
            recommendations=recommendations,
            sections=sections,
            caveats=[*(notes or []), *caveats_for(sections, summary_claims, sources)],
            method=ReportMethod(
                queries=queries,
                pages_read=len(log.pages),
                full_text_pages=sum(1 for p in log.pages if p.get("full_text")),
                sources_by_tier=dict(Counter(s.tier for s in unique_pages(sources))),
                data_points_kept=kept,
                data_points_rejected=rejected,
                model=current_llm().model,
                started_at=started_at,
                finished_at=_now(),
            ),
            sources=sources,
        )

    def new_corpus(self) -> WebCorpus:
        return self._research.new_corpus()

    async def search_batch(
        self, queries: list[str], corpus: WebCorpus, log: TraceLog, round_: int
    ) -> bool:
        """Search and read one batch of queries; False when the search service failed for all of them."""
        try:
            await self._research.gather(
                queries, corpus, log, round_=round_, max_pages=settings.REPORT_PAGES_PER_BATCH
            )
            return True
        except WebSearchError:
            logger.warning("report_search_batch_failed batch=%s", queries, exc_info=True)
            return False

    async def search(
        self, queries: list[str], corpus: WebCorpus, log: TraceLog, progress: Progress
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

    async def corroborate(
        self,
        planned: list[OutlineSection],
        sections: list[ReportSection],
        corpus: WebCorpus,
        log: TraceLog,
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
        found_per_claim = await asyncio.gather(
            *(corpus.retrieve(claim.claim, limit=4) for _, claim in weak)
        )
        for (i, _claim), found in zip(weak, found_per_claim, strict=True):
            extra.setdefault(i, []).extend(found)
        by_index = {s.index: s for s in corpus.sources}

        async def regrade(i: int, found: list[WebSource]) -> None:
            section = sections[i]
            sources = list(
                {s.index: s for s in [*_cited_sources(section.body, by_index), *found]}.values()
            )
            regraded = await self.grade(planned[i].goal, section.body, sources)
            if regraded:
                section.claims = regraded

        # Sections are independent; grading them one after another was the longest serial stretch of a repair round.
        await asyncio.gather(*(regrade(i, found) for i, found in extra.items()))
        return searches

    async def section(
        self, title: str, planned: OutlineSection, corpus: WebCorpus, used: list[str]
    ) -> tuple[ReportSection, int, int]:
        await corpus.retrieve(
            f"{planned.heading} {planned.goal}", limit=settings.REPORT_SECTION_EVIDENCE
        )
        await asyncio.gather(
            *(corpus.retrieve(indicator, limit=3) for indicator in planned.indicators)
        )
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
        body = scrub_unsupported_sentences(body, evidence)[0]
        analysis = scrub_unsupported_sentences(analysis, evidence)[0]
        cited = _cited_sources(body, by_index) or relevant
        claims = await self.grade(planned.goal, body, cited)
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

    async def summary(
        self, title: str, sections: list[ReportSection], corpus: WebCorpus
    ) -> tuple[str, list[AuditedClaim]]:
        by_index = {s.index: s for s in corpus.sources}
        texts = [(s.heading, s.body) for s in sections]
        cited = _cited_sources("\n".join(s.body for s in sections), by_index)
        weak = [
            f"{c.claim}（{LEVEL_LABELS[c.level]}）"
            for sec in sections
            for c in sec.claims
            if c.level in ("disputed", "single_source")
        ]
        summary = await write_summary(title, texts, format_evidence(cited), weak=weak)
        return summary, await self.grade(title, summary, _cited_sources(summary, by_index) or cited)

    async def synthesis(
        self, title: str, sections: list[ReportSection], corpus: WebCorpus
    ) -> tuple[str, str, list[AuditedClaim], list[Recommendation]]:
        """Cross-section judgment and advice. The judgments are inference; only their factual premises are graded."""
        by_index = {s.index: s for s in corpus.sources}
        cited = _cited_sources("\n".join(f"{s.body}\n{s.analysis}" for s in sections), by_index)
        evidence = format_evidence(cited)
        flagged = [
            f"{c.claim}（{LEVEL_LABELS[c.level]}）"
            for s in sections
            for c in s.claims
            if c.level in ("disputed", "unverified")
        ]
        try:
            audience, insights, drafts = await write_synthesis(
                title, [(s.heading, s.body, s.analysis) for s in sections], flagged, evidence
            )
        except Exception:
            logger.warning("report_synthesis_failed", exc_info=True)
            return "", "", [], []
        full_evidence = "\n".join(s.content for s in corpus.sources)
        insights = scrub_unsupported_sentences(insights, full_evidence)[0]
        insight_claims = await self.grade(
            title, insights, _cited_sources(insights, by_index) or cited
        )

        async def premises_of(rec: Recommendation) -> Recommendation | None:
            text = f"{rec.action} {rec.reason} {rec.caveat}"
            if unsupported_numbers(text, full_evidence):
                return None  # advice built on a number found in no source is dropped, not softened
            sources = _cited_sources(rec.reason, by_index)
            # Advice paraphrases its facts more freely than prose does, so its premises get a looser faithfulness bar.
            rec.premises = (
                await self.grade(title, rec.reason, sources, min_overlap=0.6) if sources else []
            )
            return rec

        # Each recommendation's premises are graded independently; doing them one by one made this step the
        # longest single task of a run.
        graded = await asyncio.gather(*(premises_of(rec) for rec in drafts))
        recommendations = [rec for rec in graded if rec is not None]
        return audience, insights, insight_claims, recommendations

    async def grade(
        self, question: str, text: str, sources: list[WebSource], *, min_overlap: float = 0.75
    ) -> list[AuditedClaim]:
        if not text.strip() or not sources:
            return []
        try:
            extracted = await extract_claims(
                question, text, format_evidence(sources), min_overlap=min_overlap
            )
        except Exception:
            logger.warning("report_claim_extraction_failed", exc_info=True)
            return []
        extracted = await recheck_support(extracted, sources)
        today = datetime.now(ZoneInfo(settings.TIMEZONE)).date()
        return audit_claims(
            extracted, sources, today=today, stale_days=settings.RESEARCH_STALE_DAYS
        ).claims


def _basis(premises: list[AuditedClaim], reason: str = "") -> str:
    if not premises:
        # Numbers in the stated reason that no premise check could confirm are weak grounds, not "no facts".
        return "weak" if re.search(r"\d", reason) else "inference"
    levels = {c.level for c in premises}
    if levels & {"disputed", "unverified"}:
        return "weak"
    return "strong" if levels == {"verified"} else "mixed"


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


# How much a source's credibility counts against topical overlap when choosing a section's evidence.
_TIER_BONUS = {"authoritative": 3, "reference": 2, "general": 0, "low": -2}
_MAX_PASSAGES_PER_PAGE = 2


def _relevant_sources(
    sources: list[WebSource], planned: OutlineSection, *, limit: int
) -> list[WebSource]:
    """Passages sharing terms with this section, weighted toward credible sites and spread over many pages.

    Term overlap alone let one mirrored document fill the whole evidence window with near-duplicate passages;
    an official release that states the figure once was crowded out.
    """
    terms = set(
        re.findall(
            r"[一-鿿]{2}|[a-z0-9]+",
            f"{planned.heading}{planned.goal}{''.join(planned.indicators)}".lower(),
        )
    )

    def score(source: WebSource) -> int:
        text = source.content.lower()
        return sum(t in text for t in terms) + _TIER_BONUS.get(source.tier, 0)

    per_page: dict[str, int] = {}
    ranked: list[WebSource] = []
    for source in sorted(sources, key=lambda s: (-score(s), s.index)):
        if per_page.get(source.url, 0) >= _MAX_PASSAGES_PER_PAGE:
            continue
        per_page[source.url] = per_page.get(source.url, 0) + 1
        ranked.append(source)
        if len(ranked) >= limit:
            break
    return sorted(ranked, key=lambda s: s.index)


def unique_pages(sources: list[WebSource]) -> list[WebSource]:
    return list({s.url: s for s in sources}.values())


def caveats_for(
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
    single = [c for s in sections for c in s.claims if c.level == "single_source"]
    if single:
        low_only = sum("低可信" in c.reason for c in single)
        notes.append(
            f"全文有 {len(single)} 条说法只找到一个来源"
            + (f"（其中 {low_only} 条只见于自媒体、论坛等低可信来源）" if low_only else "")
            + "，使用前建议对照附录一逐条核实表查看原文"
        )
    return notes


# Public names for the orchestration layer's independent verifier.
same_claim = _same_claim
LEVEL_STRENGTH = _LEVEL_STRENGTH
cited_sources = _cited_sources
relevant_sources = _relevant_sources
