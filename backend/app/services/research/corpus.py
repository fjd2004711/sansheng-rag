"""Index fetched pages for one research run and retrieve citable passages from them.

Web pages go through the same Dense + BM25 + RRF + Reranker chain as the knowledge base, in a throwaway
collection that lives only for the run, so web evidence is scored and cited exactly like library evidence.
"""

from __future__ import annotations

import hashlib
import uuid
from typing import Any

from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.services.rag.guard import mark_if_suspicious
from app.services.rag.models import (
    Document,
    DocumentMetadata,
    DocumentPage,
    DocumentPageChunk,
    SearchResult,
)
from app.services.rag.sparse import invalidate_bm25_index
from app.services.research.credibility import TIER_LABELS, source_tier
from app.services.research.models import WebPage, WebSource

_SCORE_KEYS = ("dense_score", "bm25_score", "rrf_score", "reranker_score")


def research_collection_name() -> str:
    return "research_" + uuid.uuid4().hex


class WebCorpus:
    def __init__(
        self, retrieval: Any, *, chunk_size: int, chunk_overlap: int, collection: str | None = None
    ) -> None:
        self._retrieval = retrieval
        self.collection = collection or research_collection_name()
        self._splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size, chunk_overlap=chunk_overlap
        )
        self._indexed_urls: set[str] = set()
        self._sources: dict[str, WebSource] = {}

    @property
    def sources(self) -> list[WebSource]:
        return sorted(self._sources.values(), key=lambda source: source.index)

    def has_url(self, url: str) -> bool:
        return url in self._indexed_urls

    async def add_pages(self, pages: list[WebPage]) -> int:
        """Index pages not seen before; returns the number of new chunks."""
        added = 0
        for page in pages:
            if page.url in self._indexed_urls or not page.text.strip():
                continue
            self._indexed_urls.add(page.url)
            document = _to_document(page, self._splitter.split_text(page.text))
            if not document.chunked_pages:
                continue
            await self._retrieval.store.insert_document(self.collection, document)
            added += len(document.chunked_pages)
        if added:
            invalidate_bm25_index(self.collection)
        return added

    async def retrieve(self, query: str, *, limit: int) -> list[WebSource]:
        """Passages for ``query``, numbered stably across the whole run."""
        if not self._indexed_urls:
            return []
        results = await self._retrieval.retrieve(
            query=query, collection_name=self.collection, limit=limit
        )
        return [self._register(result) for result in results]

    def _register(self, result: SearchResult) -> WebSource:
        meta = result.metadata
        info = meta.get("additional_info") or {}
        key = f"{meta.get('source_path', '')}#{meta.get('chunk_num', 0)}"
        existing = self._sources.get(key)
        if existing is not None:
            return existing
        source = WebSource(
            index=len(self._sources) + 1,
            title=str(meta.get("filename") or info.get("domain") or ""),
            url=str(meta.get("source_path") or ""),
            domain=str(info.get("domain") or ""),
            content=result.content,
            fetched_at=str(info.get("fetched_at") or ""),
            published_at=info.get("published_at"),
            from_snippet=bool(info.get("from_snippet")),
            tier=source_tier(str(meta.get("source_path") or "")),
            score=float(result.score),
            component_scores={
                k: float(meta[k]) for k in _SCORE_KEYS if isinstance(meta.get(k), int | float)
            },
        )
        self._sources[key] = source
        return source

    async def close(self) -> None:
        if self._indexed_urls:
            await self._retrieval.store.delete_collection(self.collection)
            invalidate_bm25_index(self.collection)


def _to_document(page: WebPage, chunks: list[str]) -> Document:
    document = Document(
        pages=[DocumentPage(page_num=1, content=page.text)],
        metadata=DocumentMetadata(
            filename=page.title,
            filesize=len(page.text.encode()),
            filetype="web",
            source_path=page.url,
            content_hash=hashlib.sha256(page.text.encode()).hexdigest(),
            additional_info={
                "domain": page.domain,
                "fetched_at": page.fetched_at,
                "published_at": page.published_at,
                "from_snippet": page.from_snippet,
            },
        ),
    )
    document.chunked_pages = [
        DocumentPageChunk(
            page_num=1,
            content=page.text,
            chunk_content=chunk,
            chunk_num=i,
            parent_doc_id=document.id,
        )
        for i, chunk in enumerate(chunks)
        if chunk.strip()
    ]
    return document


def format_evidence(sources: list[WebSource]) -> str:
    """Numbered evidence text for the writer and the P3 verifier."""
    if not sources:
        return ""
    blocks = []
    for source in sources:
        dated = f" · 发布于 {source.published_at}" if source.published_at else ""
        snippet = "（仅搜索摘要，未能读取全文）" if source.from_snippet else ""
        content = mark_if_suspicious(source.content)[0]
        blocks.append(
            f"[{source.index}] Source: {source.title} — {source.url}（{TIER_LABELS[source.tier]}{dated}）{snippet}\n{content}"
        )
    return "Web search results (cite inline using [1], [2], etc.):\n\n" + "\n\n".join(blocks)
