"""Web search providers. Each returns plain ``WebHit``s; pages are fetched separately."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Protocol

import httpx

from app.services.research.exceptions import ResearchNotConfiguredError, WebSearchError
from app.services.research.models import WebHit

logger = logging.getLogger(__name__)


class WebSearchClient(Protocol):
    async def search(self, query: str, *, limit: int) -> list[WebHit]: ...


class BochaSearchClient:
    """博查 Web Search API (reachable from servers in mainland China)."""

    URL = "https://api.bochaai.com/v1/web-search"

    def __init__(self, api_key: str, timeout: float = 15) -> None:
        self._api_key = api_key
        self._timeout = timeout

    async def search(self, query: str, *, limit: int) -> list[WebHit]:
        payload = {"query": query, "summary": True, "count": limit, "freshness": "noLimit"}
        data = await _post_json(self.URL, payload, self._api_key, self._timeout)
        if data.get("code") not in (None, 200):
            raise WebSearchError(
                message="网页搜索失败", details={"provider": "bocha", "code": data.get("code")}
            )
        values = ((data.get("data") or {}).get("webPages") or {}).get("value") or []
        return [
            WebHit(
                title=str(item.get("name") or ""),
                url=str(item["url"]),
                snippet=str(item.get("summary") or item.get("snippet") or ""),
                site_name=str(item.get("siteName") or ""),
                published_at=item.get("datePublished") or None,
            )
            for item in values
            if isinstance(item, dict) and item.get("url")
        ][:limit]


class TavilySearchClient:
    URL = "https://api.tavily.com/search"

    def __init__(self, api_key: str, timeout: float = 15) -> None:
        self._api_key = api_key
        self._timeout = timeout

    async def search(self, query: str, *, limit: int) -> list[WebHit]:
        payload = {"query": query, "max_results": limit, "search_depth": "basic"}
        data = await _post_json(self.URL, payload, self._api_key, self._timeout)
        return [
            WebHit(
                title=str(item.get("title") or ""),
                url=str(item["url"]),
                snippet=str(item.get("content") or ""),
                published_at=item.get("published_date") or None,
            )
            for item in data.get("results") or []
            if isinstance(item, dict) and item.get("url")
        ][:limit]


class SearxngSearchClient:
    """Self-hosted SearXNG metasearch (free, no key). Needs ``json`` in ``search.formats``."""

    def __init__(self, base_url: str, timeout: float = 30) -> None:
        self._url = base_url.rstrip("/") + "/search"
        self._timeout = timeout

    async def search(self, query: str, *, limit: int) -> list[WebHit]:
        params = {"q": query, "format": "json", "language": "zh-CN", "safesearch": 0}
        data: Any = None
        error: Exception | None = None
        # A cold query can take ~20s while engines time out; SearXNG caches it, so one retry usually answers at once.
        for _ in range(2):
            try:
                async with httpx.AsyncClient(timeout=self._timeout) as client:
                    response = await client.get(self._url, params=params)
                    response.raise_for_status()
                    data = response.json()
                error = None
                break
            except (httpx.HTTPError, ValueError) as exc:
                error = exc
        if error is not None:
            raise WebSearchError(
                message="网页搜索失败", details={"provider": "searxng", "error": str(error)}
            ) from error
        results = data.get("results") if isinstance(data, dict) else None
        blocked = data.get("unresponsive_engines") if isinstance(data, dict) else None
        if not results and blocked:
            # Every engine refused (CAPTCHA / suspended): say so instead of "nothing found".
            raise WebSearchError(
                message="搜索引擎暂时限制了访问（验证码），请稍后再试",
                details={"provider": "searxng", "engines": [str(e[0]) for e in blocked if e]},
            )
        return [
            WebHit(
                title=str(item.get("title") or ""),
                url=str(item["url"]),
                snippet=str(item.get("content") or ""),
                site_name=str(item.get("engine") or ""),
                published_at=item.get("publishedDate") or None,
            )
            for item in results or []
            if isinstance(item, dict)
            and str(item.get("url", "")).startswith(("http://", "https://"))
        ][:limit]


async def _post_json(
    url: str, payload: dict[str, Any], api_key: str, timeout: float
) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                url, json=payload, headers={"Authorization": f"Bearer {api_key}"}
            )
            response.raise_for_status()
            data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise WebSearchError(
            message="网页搜索失败", details={"url": url, "error": str(exc)}
        ) from exc
    if not isinstance(data, dict):
        raise WebSearchError(message="网页搜索返回格式不正确", details={"url": url})
    return data


class ThrottledSearchClient:
    """Limit concurrent searches: free metasearch engines answer bursts with CAPTCHAs."""

    def __init__(self, inner: WebSearchClient, concurrency: int) -> None:
        self._inner = inner
        self._semaphore = asyncio.Semaphore(max(1, concurrency))

    async def search(self, query: str, *, limit: int) -> list[WebHit]:
        async with self._semaphore:
            return await self._inner.search(query, limit=limit)


class FallbackSearchClient:
    """Use the primary provider; switch to the fallback when it fails or finds nothing."""

    def __init__(self, primary: WebSearchClient, fallback: WebSearchClient) -> None:
        self._primary = primary
        self._fallback = fallback

    async def search(self, query: str, *, limit: int) -> list[WebHit]:
        try:
            hits = await self._primary.search(query, limit=limit)
        except WebSearchError as exc:
            logger.info("research_search_fallback query=%s reason=%s", query, exc.message)
            return await self._fallback.search(query, limit=limit)
        return hits or await self._fallback.search(query, limit=limit)


def build_search_chain(
    *,
    provider: str,
    api_key: str,
    searxng_url: str,
    fallback_provider: str = "",
    fallback_api_key: str = "",
    concurrency: int = 2,
) -> WebSearchClient:
    """The configured provider, throttled, with an optional fallback provider behind it."""
    client: WebSearchClient = ThrottledSearchClient(
        build_search_client(provider, api_key, searxng_url), concurrency
    )
    if fallback_provider:
        client = FallbackSearchClient(
            client, build_search_client(fallback_provider, fallback_api_key, searxng_url)
        )
    return client


def build_search_client(provider: str, api_key: str, searxng_url: str = "") -> WebSearchClient:
    if provider == "searxng":
        if not searxng_url:
            raise ResearchNotConfiguredError(
                message="联网调研还没有配置搜索服务，请联系管理员设置 RESEARCH_SEARXNG_URL",
                details={"provider": provider},
            )
        return SearxngSearchClient(searxng_url)
    if not api_key:
        raise ResearchNotConfiguredError(
            message="联网调研还没有配置搜索服务，请联系管理员设置 RESEARCH_SEARCH_API_KEY",
            details={"provider": provider},
        )
    if provider == "tavily":
        return TavilySearchClient(api_key)
    if provider == "bocha":
        return BochaSearchClient(api_key)
    raise ResearchNotConfiguredError(message="不支持的搜索服务", details={"provider": provider})
