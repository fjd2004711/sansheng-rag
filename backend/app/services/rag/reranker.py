"""P1 reranker implementations."""

from __future__ import annotations

import json
import logging
import re
from abc import ABC, abstractmethod
from typing import Any

from openai import AsyncOpenAI

from app.core.config import settings
from app.core.llm_runtime import current_llm
from app.core.usage_meter import record_openai_response
from app.services.rag.config import RAGSettings, RerankerConfig
from app.services.rag.models import SearchResult

logger = logging.getLogger(__name__)


class BaseReranker(ABC):
    """Abstract base for document relevance rerankers."""

    @abstractmethod
    async def rerank(
        self, query: str, results: list[SearchResult], top_k: int
    ) -> list[SearchResult]: ...

    @property
    @abstractmethod
    def name(self) -> str: ...


class LLMJSONReranker(BaseReranker):
    """Use the configured OpenAI-compatible chat model as a deterministic relevance reranker."""

    def __init__(self, config: RerankerConfig) -> None:
        self.config = config
        # Deliberately use the provider client rather than an in-graph Runnable.
        # A nested LangChain invocation inherits the Agent stream callbacks and its
        # JSON control response becomes a user-visible text_delta.
        self._default_client = AsyncOpenAI(base_url=config.base_url, api_key=config.api_key)

    @property
    def name(self) -> str:
        return f"llm-json:{self.config.model}"

    async def rerank(
        self, query: str, results: list[SearchResult], top_k: int
    ) -> list[SearchResult]:
        candidates = results[: self.config.candidate_limit]
        if not candidates:
            return []

        payload = [
            {"id": index, "text": result.content[:1600]} for index, result in enumerate(candidates)
        ]
        prompt = (
            "Rank the evidence passages by relevance to the user query. "
            "Return only a JSON array ordered from most to least relevant. "
            'Each item must contain {"id": integer, "score": number from 0 to 100}.\n'
            f"Query: {query}\nCandidates: {json.dumps(payload, ensure_ascii=False)}"
        )
        llm = current_llm()
        # A user's own model replaces the server's for the whole turn, reranking included.
        client = (
            AsyncOpenAI(base_url=llm.base_url, api_key=llm.api_key)
            if llm.is_custom
            else self._default_client
        )
        response = await client.chat.completions.create(
            model=llm.model if llm.is_custom else self.config.model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            extra_body=llm.extra_body if llm.is_custom else settings.llm_extra_body,
        )
        record_openai_response(response)
        rankings = _parse_rankings(response.choices[0].message.content or "")
        if not rankings:
            logger.warning("Reranker returned no parseable ranking; preserving RRF order")
            return candidates[:top_k]

        ranked: list[SearchResult] = []
        seen: set[int] = set()
        for candidate_id, score in rankings:
            if candidate_id < 0 or candidate_id >= len(candidates) or candidate_id in seen:
                continue
            seen.add(candidate_id)
            result = candidates[candidate_id]
            ranked.append(
                SearchResult(
                    content=result.content,
                    score=score / 100.0,
                    metadata={**result.metadata, "reranker_score": score},
                    parent_doc_id=result.parent_doc_id,
                )
            )
        # Keep valid candidates omitted by a malformed partial reply, after ranked items.
        ranked.extend(result for index, result in enumerate(candidates) if index not in seen)
        return ranked[:top_k]


def _parse_rankings(content: Any) -> list[tuple[int, float]]:
    text = content if isinstance(content, str) else str(content)
    match = re.search(r"\[[\s\S]*\]", text)
    if not match:
        return []
    try:
        value = json.loads(match.group(0))
    except json.JSONDecodeError:
        return []
    if not isinstance(value, list):
        return []

    rankings: list[tuple[int, float]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        candidate_id, score = item.get("id"), item.get("score")
        if isinstance(candidate_id, int) and isinstance(score, (int, float)):
            rankings.append((candidate_id, float(score)))
    return rankings


class RerankService:
    """Create and run the configured P1 reranker."""

    def __init__(self, settings: RAGSettings):
        self.config = settings.reranker_config
        self._reranker: BaseReranker | None = (
            LLMJSONReranker(self.config) if self.config.enabled else None
        )

    @property
    def is_enabled(self) -> bool:
        return self._reranker is not None

    async def rerank(
        self, query: str, results: list[SearchResult], top_k: int
    ) -> list[SearchResult]:
        if self._reranker is None:
            return results[:top_k]
        return await self._reranker.rerank(query, results, top_k)
