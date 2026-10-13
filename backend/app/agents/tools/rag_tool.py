"""RAG tool for agent knowledge base search."""

import json
import logging
from typing import TYPE_CHECKING, Any

from app.core.config import settings
from app.core.exceptions import ExternalServiceError
from app.core.kb_scope import current_scope
from app.graph.retrieval_correction import CorrectiveRetriever
from app.services.rag.embeddings import EmbeddingService
from app.services.rag.guard import guard_event, mark_if_suspicious
from app.services.rag.reranker import RerankService
from app.services.rag.retrieval import RetrievalService
from app.services.rag.vectorstore import QdrantVectorStore

logger = logging.getLogger(__name__)
_TRACE_PREFIX = "\n<!-- RAG_TRACE:"
_TRACE_SUFFIX = " -->"

if TYPE_CHECKING:
    from app.services.rag.models import SearchResult
    from app.services.rag.retrieval import BaseRetrievalService

_retrieval_service: "BaseRetrievalService | None" = None


def get_retrieval_service() -> "BaseRetrievalService":
    """Get or create retrieval service singleton."""
    global _retrieval_service
    if _retrieval_service is not None:
        return _retrieval_service

    rag_settings = settings.rag
    embedding_service = EmbeddingService(rag_settings)
    vector_store = QdrantVectorStore(rag_settings, embedding_service)
    _retrieval_service = RetrievalService(
        vector_store,
        rag_settings,
        rerank_service=RerankService(rag_settings),
    )
    return _retrieval_service


def _format_results(results: list[Any]) -> str:
    if not results:
        return "No relevant documents found in the knowledge base."
    formatted = []
    for i, result in enumerate(results, start=1):
        source = result.metadata.get("filename", "unknown")
        page = result.metadata.get("page_num", "")
        chunk = result.metadata.get("chunk_num", "")
        col = result.metadata.get("collection", "")
        page_info = f", page {page}" if page is not None else ""
        chunk_info = f", chunk {chunk}" if chunk is not None else ""
        # Text transcribed from a scanned page by the vision model; the UI labels it as recognised text.
        ocr_info = ", ocr" if result.metadata.get("extraction") == "ocr" else ""
        col_info = f" [{col}]" if col else ""
        component_scores = [
            f"{key}={float(result.metadata[key]):.4f}"
            for key in ("dense_score", "bm25_score", "rrf_score", "reranker_score")
            if isinstance(result.metadata.get(key), (int, float))
        ]
        score_line = f"Scores: {', '.join(component_scores)}\n" if component_scores else ""
        formatted.append(
            f"[{i}] Source: {source}{page_info}{chunk_info}{ocr_info}{col_info} (score: {result.score:.3f})\n"
            f"{score_line}{mark_if_suspicious(result.content)[0]}"
        )
    return (
        "Search results (cite inline using [1], [2], etc. — do NOT list sources at the end):\n\n"
        + "\n\n".join(formatted)
    )


class _ConfiguredRetriever:
    """Adapt one tool invocation's collection scope to the P2 graph interface."""

    def __init__(
        self,
        service: Any,
        collection: str | None,
        collections: list[str] | None,
        top_k: int,
    ) -> None:
        self.service = service
        self.collection = collection
        self.collections = collections
        self.top_k = top_k

    async def search(self, query: str) -> list["SearchResult"]:
        return await _retrieve_once(
            self.service,
            query=query,
            collection=self.collection,
            collections=self.collections,
            top_k=self.top_k,
        )


async def _retrieve_once(
    service: Any,
    *,
    query: str,
    collection: str | None,
    collections: list[str] | None,
    top_k: int,
) -> list["SearchResult"]:
    scope = current_scope()
    if scope is not None:
        # A bound scope (the signed-in user's shared + private libraries) overrides any requested name.
        return await _retrieve_in_scope(service, query=query, top_k=top_k, scope=scope)
    default_collection = settings.rag.collection_name
    target_collection = collection or default_collection

    if collections and len(collections) > 1:
        return await service.retrieve_multi(query=query, collection_names=collections, limit=top_k)
    if target_collection != "all":
        return await service.retrieve(query=query, collection_name=target_collection, limit=top_k)

    try:
        all_collections = await service.store.list_collections()
        if not all_collections:
            return []
        if len(all_collections) == 1:
            return await service.retrieve(
                query=query, collection_name=all_collections[0], limit=top_k
            )
        return await service.retrieve_multi(
            query=query, collection_names=all_collections, limit=top_k
        )
    except Exception as exc:
        logger.error("Failed to list collections: %s", exc, exc_info=True)
        raise ExternalServiceError(
            message="Failed to list knowledge base collections", details={"error": str(exc)}
        ) from exc


async def _retrieve_in_scope(
    service: Any, *, query: str, top_k: int, scope: Any
) -> list["SearchResult"]:
    # Restricting to named files is a post-filter, so over-fetch to keep enough candidates.
    limit = top_k * 4 if scope.filenames else top_k
    if len(scope.collections) > 1:
        results = await service.retrieve_multi(
            query=query, collection_names=scope.collections, limit=limit
        )
    else:
        results = await service.retrieve(
            query=query, collection_name=scope.collections[0], limit=limit
        )
    if scope.filenames:
        results = [r for r in results if r.metadata.get("filename") in scope.filenames]
    return results[:top_k]


async def search_knowledge_base(
    query: str,
    collection: str | None = None,
    collections: list[str] | None = None,
    top_k: int = 5,
) -> str:
    """Search the knowledge base and return formatted, citable results."""
    service: Any = get_retrieval_service()
    configured_retriever = _ConfiguredRetriever(service, collection, collections, top_k)
    correction_config = settings.rag.correction_config

    if not correction_config.enabled:
        found = await configured_retriever.search(query)
        flag = guard_event(found)
        return _append_trace(_format_results(found), [flag]) if flag else _format_results(found)

    result = await CorrectiveRetriever(
        configured_retriever, max_rounds=correction_config.max_rounds
    ).run(query)
    logger.info(
        "[P2] retrieval correction finished: rounds=%d, abstained=%s, trace=%s",
        result.retrieval_round,
        result.abstained,
        [event.model_dump(mode="json") for event in result.trace],
    )
    if result.abstained:
        output = (
            "KNOWLEDGE_BASE_ABSTAIN: The knowledge base does not contain sufficient "
            "evidence to answer this question. Tell the user that the answer is unavailable "
            "from the indexed documents; do not infer or invent an answer."
        )
    else:
        output = _format_results(result.retrieved_docs)
    trace = [event.model_dump(mode="json") for event in result.trace]
    flag = guard_event(result.retrieved_docs)
    if flag:
        trace.append(flag)
    return _append_trace(output, trace)


def _append_trace(output: str, trace: list[dict[str, Any]]) -> str:
    """Carry P2 trace through a tool result; the WebSocket layer removes it for users."""
    return f"{output}{_TRACE_PREFIX}{json.dumps(trace, ensure_ascii=False)}{_TRACE_SUFFIX}"


def extract_rag_trace(content: str) -> tuple[str, list[dict[str, Any]]]:
    """Split a private P2 trace from tool text before it reaches the UI or persistence."""
    if _TRACE_PREFIX not in content or not content.endswith(_TRACE_SUFFIX):
        return content, []
    visible, raw = content.rsplit(_TRACE_PREFIX, 1)
    try:
        trace = json.loads(raw[: -len(_TRACE_SUFFIX)])
    except json.JSONDecodeError:
        return content, []
    if not isinstance(trace, list) or not all(isinstance(event, dict) for event in trace):
        return content, []
    return visible, trace


__all__ = ["extract_rag_trace", "search_knowledge_base"]
