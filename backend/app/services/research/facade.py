"""ResearchService: answer a question from the web, with every claim cited and checked.

Steps: plan search queries → search → fetch and extract pages → index them for this run → hybrid retrieval
→ write a cited answer → P3 claim-by-claim verification, which may run a bounded supplemental web search.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any, Protocol

from app.core.config import settings
from app.graph.generation_correction import GenerationCorrector
from app.services.rag.embeddings import EmbeddingService
from app.services.rag.generation.evaluator import _ABSTAIN_MESSAGE, AnswerEvaluator
from app.services.rag.guard import scan_text
from app.services.rag.reranker import RerankService
from app.services.rag.retrieval import RetrievalService
from app.services.rag.vectorstore import QdrantVectorStore
from app.services.research.corpus import WebCorpus, format_evidence
from app.services.research.exceptions import WebSearchError
from app.services.research.fetcher import PageFetcher
from app.services.research.models import ResearchResult, WebHit, WebPage, WebSource
from app.services.research.search_client import WebSearchClient, build_search_client
from app.services.research.writer import WEB_ABSTAIN_MESSAGE, plan_queries, write_answer

logger = logging.getLogger(__name__)

_FETCH_CONCURRENCY = 4
_QUERY_EVIDENCE = 3


class ResearchEvents(Protocol):
    async def trace(self, event: dict[str, Any]) -> None: ...

    async def sources(self, queries: list[str], sources: list[WebSource]) -> None: ...

    async def draft(self, text: str) -> None: ...


class ResearchService:
    def __init__(
        self,
        *,
        search_client: WebSearchClient,
        fetcher: PageFetcher,
        retrieval: Any,
        corrector_factory: Callable[[Callable[[str], Awaitable[str]]], Any] | None = None,
    ) -> None:
        self._search = search_client
        self._fetcher = fetcher
        self._retrieval = retrieval
        self._corrector_factory = corrector_factory or (
            lambda search: GenerationCorrector(
                evidence_search=search,
                evaluator=AnswerEvaluator(
                    corpus="the web evidence", abstain_message=WEB_ABSTAIN_MESSAGE
                ),
                max_corrections=max(1, settings.RESEARCH_MAX_SUPPLEMENTAL_SEARCHES),
            )
        )

    @classmethod
    def from_settings(cls) -> ResearchService:
        search_client = build_search_client(
            settings.RESEARCH_SEARCH_PROVIDER, settings.RESEARCH_SEARCH_API_KEY
        )
        rag = settings.rag
        retrieval = RetrievalService(
            QdrantVectorStore(rag, EmbeddingService(rag)), rag, rerank_service=RerankService(rag)
        )
        fetcher = PageFetcher(
            timeout=settings.RESEARCH_FETCH_TIMEOUT_SECONDS,
            max_bytes=settings.RESEARCH_FETCH_MAX_BYTES,
        )
        return cls(search_client=search_client, fetcher=fetcher, retrieval=retrieval)

    async def run(self, question: str, events: ResearchEvents) -> ResearchResult:
        queries = await plan_queries(question, max_queries=settings.RESEARCH_MAX_QUERIES)
        await events.trace(
            {
                "step": "research_plan",
                "round": 0,
                "status": "COMPLETE",
                "detail": {"queries": queries},
            }
        )
        corpus = WebCorpus(
            self._retrieval,
            chunk_size=settings.rag.chunk_size,
            chunk_overlap=settings.rag.chunk_overlap,
        )
        try:
            await self._gather(queries, corpus, events, round_=0)
            await corpus.retrieve(question, limit=settings.RESEARCH_EVIDENCE_TOP_K)
            for query in queries:
                if query != question:
                    await corpus.retrieve(query, limit=_QUERY_EVIDENCE)
            await self._report_evidence(corpus.sources, events, queries, round_=0)
            if not corpus.sources:
                await events.trace(
                    {
                        "step": "abstain",
                        "round": 0,
                        "status": "ABSTAIN",
                        "detail": {"reason": "网上没有搜到和这个问题相关、且能读取的资料。"},
                    }
                )
                return ResearchResult(
                    answer=WEB_ABSTAIN_MESSAGE,
                    queries=queries,
                    sources=[],
                    evidence="",
                    abstained=True,
                )

            answer = await write_answer(question, format_evidence(corpus.sources), events.draft)

            async def supplemental_search(query: str) -> str:
                queries.append(query)
                await self._gather([query], corpus, events, round_=1)
                await corpus.retrieve(query, limit=_QUERY_EVIDENCE + 2)
                await self._report_evidence(corpus.sources, events, queries, round_=1)
                return format_evidence(corpus.sources)

            checked = await self._corrector_factory(supplemental_search).run(
                question, answer or WEB_ABSTAIN_MESSAGE, format_evidence(corpus.sources)
            )
            for event in checked.trace:
                await events.trace(event.model_dump(mode="json"))
            abstained = checked.abstained or checked.answer.strip() in (
                _ABSTAIN_MESSAGE,
                WEB_ABSTAIN_MESSAGE,
            )
            return ResearchResult(
                answer=WEB_ABSTAIN_MESSAGE if abstained else checked.answer,
                queries=queries,
                sources=corpus.sources,
                evidence=format_evidence(corpus.sources),
                abstained=abstained,
            )
        finally:
            try:
                await corpus.close()
            except Exception:
                logger.warning(
                    "research_collection_cleanup_failed collection=%s",
                    corpus.collection,
                    exc_info=True,
                )

    async def _gather(
        self, queries: list[str], corpus: WebCorpus, events: ResearchEvents, *, round_: int
    ) -> None:
        """Search every query, fetch the new pages, and index them."""
        outcomes = await asyncio.gather(
            *(self._search.search(q, limit=settings.RESEARCH_RESULTS_PER_QUERY) for q in queries),
            return_exceptions=True,
        )
        hits: list[WebHit] = []
        per_query = []
        for query, outcome in zip(queries, outcomes, strict=True):
            if isinstance(outcome, BaseException):
                logger.warning("research_search_failed query=%s error=%s", query, outcome)
                per_query.append({"query": query, "hits": 0, "failed": True})
                continue
            per_query.append({"query": query, "hits": len(outcome)})
            hits.extend(outcome)
        if all(isinstance(o, BaseException) for o in outcomes):
            await events.trace(
                {
                    "step": "web_search",
                    "round": round_,
                    "status": "FAILED",
                    "detail": {"queries": per_query},
                }
            )
            raise WebSearchError(
                message="网页搜索暂时不可用，请稍后再试", details={"queries": queries}
            )

        fresh = _unique_new(hits, corpus)[: settings.RESEARCH_MAX_PAGES]
        await events.trace(
            {
                "step": "web_search",
                "round": round_,
                "status": "COMPLETE" if fresh else "EMPTY",
                "detail": {"queries": per_query, "new_pages": len(fresh)},
            }
        )
        if not fresh:
            return
        semaphore = asyncio.Semaphore(_FETCH_CONCURRENCY)

        async def fetch(hit: WebHit) -> WebPage:
            async with semaphore:
                return await self._fetcher.fetch(hit)

        pages = [
            page for page in await asyncio.gather(*(fetch(h) for h in fresh)) if page.text.strip()
        ]
        chunks = await corpus.add_pages(pages)
        await events.trace(
            {
                "step": "web_fetch",
                "round": round_,
                "status": "COMPLETE" if pages else "EMPTY",
                "detail": {
                    "pages": [
                        {
                            "title": p.title,
                            "domain": p.domain,
                            "url": p.url,
                            "full_text": not p.from_snippet,
                        }
                        for p in pages
                    ],
                    "chunks": chunks,
                },
            }
        )

    async def _report_evidence(
        self, sources: list[WebSource], events: ResearchEvents, queries: list[str], *, round_: int
    ) -> None:
        await events.sources(list(queries), sources)
        await events.trace(
            {
                "step": "web_evidence",
                "round": round_,
                "status": "COMPLETE" if sources else "EMPTY",
                "detail": {
                    "count": len(sources),
                    "domains": sorted({s.domain for s in sources}),
                },
            }
        )
        flagged = [
            {"source": s.domain, "patterns": hits}
            for s in sources
            if (hits := scan_text(s.content))
        ]
        if flagged:
            await events.trace(
                {
                    "step": "content_guard",
                    "round": round_,
                    "status": "STOP",
                    "detail": {"flagged": flagged},
                }
            )


def _unique_new(hits: list[WebHit], corpus: WebCorpus) -> list[WebHit]:
    seen: set[str] = set()
    unique = []
    for hit in hits:
        key = hit.url.split("#")[0].rstrip("/")
        if key in seen or corpus.has_url(hit.url):
            continue
        seen.add(key)
        unique.append(hit)
    return unique
