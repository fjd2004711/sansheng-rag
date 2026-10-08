"""Unit tests for P1 full-corpus sparse retrieval and RRF fusion."""

import pytest

from app.services.rag.models import SearchResult
from app.services.rag.retrieval import RetrievalService
from app.services.rag.sparse import FullCollectionBM25


class FakeVectorStore:
    def __init__(self, chunks: list[SearchResult]) -> None:
        self.chunks = chunks
        self.list_calls = 0

    async def list_chunks(self, collection_name: str) -> list[SearchResult]:
        self.list_calls += 1
        return self.chunks


@pytest.mark.anyio
async def test_bm25_searches_the_full_collection_not_dense_candidates() -> None:
    store = FakeVectorStore(
        [
            SearchResult(
                content="generic semantic overview", score=0.0, parent_doc_id="dense-only"
            ),
            SearchResult(
                content="The rare identifier ZXQ-991 belongs to the retrieval benchmark.",
                score=0.0,
                parent_doc_id="lexical-hit",
            ),
            SearchResult(content="unrelated archival notice", score=0.0, parent_doc_id="other"),
        ]
    )
    index = FullCollectionBM25()

    results = await index.search(store, "documents", "ZXQ-991", limit=2)

    assert [result.parent_doc_id for result in results] == ["lexical-hit"]
    assert results[0].metadata["bm25_score"] > 0
    assert store.list_calls == 1


@pytest.mark.anyio
async def test_bm25_cache_is_invalidated_after_collection_mutation() -> None:
    store = FakeVectorStore([SearchResult(content="alpha token", score=0.0, parent_doc_id="first")])
    index = FullCollectionBM25()

    await index.search(store, "documents", "alpha", limit=1)
    index.invalidate("documents")
    await index.search(store, "documents", "alpha", limit=1)

    assert store.list_calls == 2


def test_rrf_keeps_component_scores_for_evidence_inspection() -> None:
    dense = SearchResult(
        content="same chunk",
        score=0.91,
        metadata={"chunk_num": 1, "dense_score": 0.91},
        parent_doc_id="doc-1",
    )
    sparse = SearchResult(
        content="same chunk",
        score=4.2,
        metadata={"chunk_num": 1, "bm25_score": 4.2},
        parent_doc_id="doc-1",
    )

    fused = RetrievalService._rrf_fuse([dense], [sparse])

    assert len(fused) == 1
    assert fused[0].metadata["dense_score"] == 0.91
    assert fused[0].metadata["bm25_score"] == 4.2
    assert fused[0].metadata["rrf_score"] > 0
