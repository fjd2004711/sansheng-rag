"""Full-corpus BM25 retrieval for P1 Hybrid RAG.

The index is built from every chunk in a collection, never from Dense candidates.
It is cached in-process and invalidated whenever ingestion mutates a collection.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from rank_bm25 import BM25Okapi

from app.services.rag.models import SearchResult
from app.services.rag.vectorstore import BaseVectorStore

_TOKEN_RE = re.compile(r"[a-zA-Z0-9_]+|[\u4e00-\u9fff]")


def tokenize(text: str) -> list[str]:
    """Tokenize English identifiers and individual CJK characters deterministically."""
    return _TOKEN_RE.findall(text.lower())


@dataclass(slots=True)
class _CachedIndex:
    chunks: list[SearchResult]
    bm25: BM25Okapi
    token_sets: list[set[str]]


class FullCollectionBM25:
    """In-memory sparse index cache keyed by vector collection name."""

    def __init__(self) -> None:
        self._indexes: dict[str, _CachedIndex] = {}

    def invalidate(self, collection_name: str) -> None:
        self._indexes.pop(collection_name, None)

    async def search(
        self,
        store: BaseVectorStore,
        collection_name: str,
        query: str,
        limit: int,
        filter_expr: str = "",
    ) -> list[SearchResult]:
        cached = self._indexes.get(collection_name)
        if cached is None:
            chunks = await store.list_chunks(collection_name)
            corpus = [tokenize(chunk.content) for chunk in chunks]
            if not chunks or not any(corpus):
                return []
            cached = _CachedIndex(
                chunks=chunks,
                bm25=BM25Okapi(corpus),
                token_sets=[set(tokens) for tokens in corpus],
            )
            self._indexes[collection_name] = cached

        query_tokens = tokenize(query)
        if not query_tokens:
            return []
        query_terms = set(query_tokens)

        allowed_document_id = _document_id_from_filter(filter_expr)
        scored: list[tuple[SearchResult, float]] = []
        for chunk, score, chunk_terms in zip(
            cached.chunks, cached.bm25.get_scores(query_tokens), cached.token_sets, strict=True
        ):
            if allowed_document_id and chunk.parent_doc_id != allowed_document_id:
                continue
            # BM25 scores can be zero or negative when every chunk shares a term.
            # Overlap, rather than the score sign, determines lexical eligibility.
            if query_terms.intersection(chunk_terms):
                scored.append((chunk, float(score)))

        scored.sort(key=lambda item: item[1], reverse=True)
        return [
            SearchResult(
                content=chunk.content,
                score=score,
                metadata={**chunk.metadata, "bm25_score": score},
                parent_doc_id=chunk.parent_doc_id,
            )
            for chunk, score in scored[:limit]
        ]


def _document_id_from_filter(filter_expr: str) -> str | None:
    match = re.search(r'parent_doc_id\s*==\s*"([^"]+)"', filter_expr)
    return match.group(1) if match else None


bm25_index = FullCollectionBM25()


def invalidate_bm25_index(collection_name: str) -> None:
    bm25_index.invalidate(collection_name)
