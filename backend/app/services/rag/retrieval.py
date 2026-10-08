from __future__ import annotations

import hashlib
import logging
import time
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

from app.services.rag.config import RAGSettings
from app.services.rag.models import SearchResult
from app.services.rag.sparse import bm25_index
from app.services.rag.vectorstore import BaseVectorStore

if TYPE_CHECKING:
    from app.services.rag.reranker import RerankService

logger = logging.getLogger(__name__)


def _result_key(r: SearchResult) -> str:
    if r.parent_doc_id:
        return f"{r.parent_doc_id}:{r.metadata.get('chunk_num', '')}"
    return hashlib.md5(r.content.encode()).hexdigest()


class BaseRetrievalService(ABC):
    @abstractmethod
    async def retrieve(
        self,
        query: str,
        collection_name: str,
        limit: int = 5,
        min_score: float = 0.0,
        filter: str = "",
    ) -> list[SearchResult]:
        pass

    @abstractmethod
    async def retrieve_by_document(
        self, query: str, collection_name: str, document_id: str, limit: int = 3
    ) -> list[SearchResult]:
        pass


class RetrievalService(BaseRetrievalService):
    def __init__(
        self,
        vector_store: BaseVectorStore,
        settings: RAGSettings,
        rerank_service: RerankService | None = None,
    ):
        self.store = vector_store
        self.settings = settings
        self.rerank_service = rerank_service
        self._reranker_enabled = rerank_service is not None and rerank_service.is_enabled
        self._hybrid_enabled = settings.enable_hybrid_search

    @staticmethod
    def _rrf_fuse(
        vector_results: list[SearchResult],
        bm25_results: list[SearchResult],
        k: int = 60,
    ) -> list[SearchResult]:
        """Fuse independently retrieved Dense and full-corpus BM25 rankings."""
        scores: dict[str, float] = {}
        result_map: dict[str, SearchResult] = {}

        for rank, result in enumerate(vector_results, start=1):
            key = _result_key(result)
            scores[key] = scores.get(key, 0.0) + 1.0 / (k + rank)
            result_map[key] = result

        for rank, result in enumerate(bm25_results, start=1):
            key = _result_key(result)
            scores[key] = scores.get(key, 0.0) + 1.0 / (k + rank)
            if key in result_map:
                dense = result_map[key]
                result_map[key] = SearchResult(
                    content=dense.content,
                    score=dense.score,
                    metadata={**dense.metadata, "bm25_score": result.score},
                    parent_doc_id=dense.parent_doc_id,
                )
            else:
                result_map[key] = result

        return [
            SearchResult(
                content=result_map[key].content,
                score=scores[key],
                metadata={**result_map[key].metadata, "rrf_score": scores[key]},
                parent_doc_id=result_map[key].parent_doc_id,
            )
            for key in sorted(scores, key=scores.get, reverse=True)
        ]

    async def _bm25_search(
        self, query: str, collection_name: str, limit: int, filter_expr: str = ""
    ) -> list[SearchResult]:
        """Retrieve from the complete collection BM25 index, never Dense candidates."""
        return await bm25_index.search(
            store=self.store,
            collection_name=collection_name,
            query=query,
            limit=limit,
            filter_expr=filter_expr,
        )

    async def retrieve(
        self,
        query: str,
        collection_name: str,
        limit: int = 5,
        min_score: float = 0.0,
        filter: str = "",
        use_reranker: bool = False,
    ) -> list[SearchResult]:
        should_rerank = self._reranker_enabled and (self.settings.reranker_config.enabled or use_reranker)

        # Fetch 3x when reranking: gives the reranker room to eliminate weak candidates
        fetch_multiplier = 3 if should_rerank else 2

        logger.info(
            "[RETRIEVAL] Query: '%.50s...', collection: %s, limit: %d, filter: '%s', rerank: %s",
            query,
            collection_name,
            limit,
            filter,
            should_rerank,
        )

        start_time = time.time()

        dense_results = await self.store.search(
            collection_name=collection_name,
            query=query,
            filter_expr=filter,
            limit=limit * fetch_multiplier,
        )
        pipeline_results = [
            SearchResult(
                content=result.content,
                score=result.score,
                metadata={**result.metadata, "dense_score": result.score},
                parent_doc_id=result.parent_doc_id,
            )
            for result in dense_results
        ]

        search_time = time.time() - start_time
        logger.info(
            "[RETRIEVAL] Vector search completed in %.3fs, found %d results",
            search_time,
            len(pipeline_results),
        )

        if self._hybrid_enabled:
            bm25_results = await self._bm25_search(
                query,
                collection_name,
                limit * fetch_multiplier,
                filter_expr=filter,
            )
            if bm25_results:
                pipeline_results = self._rrf_fuse(pipeline_results, bm25_results)
                logger.info("[RETRIEVAL] Hybrid search: fused %d results", len(pipeline_results))

        for i, r in enumerate(pipeline_results[:3]):
            logger.debug(
                "[RETRIEVAL] Initial result #%d: score=%.4f, content='%.50s...'",
                i + 1,
                r.score,
                r.content,
            )

        if should_rerank and self.rerank_service:
            logger.info("[RETRIEVAL] Applying reranking...")
            rerank_start = time.time()
            pipeline_results = await self.rerank_service.rerank(
                query=query,
                results=pipeline_results,
                top_k=limit * 2,  # Get more from reranker before filtering
            )

            rerank_time = time.time() - rerank_start
            logger.info(
                "[RETRIEVAL] Reranking completed in %.3fs, returned %d results",
                rerank_time,
                len(pipeline_results),
            )
        elif use_reranker and not self._reranker_enabled:
            logger.warning("[RETRIEVAL] Reranking requested but not configured - skipping")

        filtered_results = [res for res in pipeline_results if res.score >= min_score]

        seen_keys: set[str] = set()
        deduped_results: list[SearchResult] = []
        for r in filtered_results:
            key = _result_key(r)
            if key not in seen_keys:
                seen_keys.add(key)
                deduped_results.append(r)

        if len(deduped_results) < len(filtered_results):
            logger.info(
                "[RETRIEVAL] Deduplicated: %d -> %d results",
                len(filtered_results),
                len(deduped_results),
            )

        for i, r in enumerate(deduped_results[:3]):
            logger.debug(
                "[RETRIEVAL] Final result #%d: score=%.4f, content='%.50s...'",
                i + 1,
                r.score,
                r.content,
            )

        final_results = deduped_results[:limit]

        total_time = time.time() - start_time
        logger.info(
            "[RETRIEVAL] Total retrieval time: %.3fs, returning %d results",
            total_time,
            len(final_results),
        )

        return final_results

    async def retrieve_multi(
        self,
        query: str,
        collection_names: list[str],
        limit: int = 5,
        min_score: float = 0.0,
        use_reranker: bool = False,
    ) -> list[SearchResult]:
        all_results: list[SearchResult] = []
        for name in collection_names:
            try:
                results = await self.retrieve(
                    query=query,
                    collection_name=name,
                    limit=limit,
                    min_score=min_score,
                    use_reranker=use_reranker,
                )
                # Tag results with collection name in metadata
                for r in results:
                    r.metadata["collection"] = name
                all_results.extend(results)
            except Exception:
                logger.exception("[RETRIEVAL] Failed to search collection '%s'", name)

        all_results.sort(key=lambda r: r.score, reverse=True)

        seen_keys: set[str] = set()
        deduped: list[SearchResult] = []
        for r in all_results:
            key = _result_key(r)
            if key not in seen_keys:
                seen_keys.add(key)
                deduped.append(r)

        return deduped[:limit]

    async def retrieve_by_document(
        self,
        query: str,
        collection_name: str,
        document_id: str,
        limit: int = 3,
        use_reranker: bool = False,
    ) -> list[SearchResult]:
        """Retrieve chunks restricted to a single document."""
        # Sanitize document_id to prevent filter injection
        sanitized_id = document_id.replace('"', "").replace("\\", "")
        filter_expr = f'parent_doc_id == "{sanitized_id}"'
        logger.info(
            "[RETRIEVAL] Retrieve by document: doc_id=%s, query='%.30s...', limit=%d, rerank=%s",
            document_id,
            query,
            limit,
            use_reranker,
        )
        return await self.retrieve(
            query=query,
            collection_name=collection_name,
            limit=limit,
            filter=filter_expr,
            use_reranker=use_reranker,
        )
