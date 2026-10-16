"""Web search providers. Each returns plain ``WebHit``s; pages are fetched separately."""

from __future__ import annotations

from typing import Any, Protocol

import httpx

from app.services.research.exceptions import ResearchNotConfiguredError, WebSearchError
from app.services.research.models import WebHit


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

    def __init__(self, base_url: str, timeout: float = 20) -> None:
        self._url = base_url.rstrip("/") + "/search"
        self._timeout = timeout

    async def search(self, query: str, *, limit: int) -> list[WebHit]:
        params = {"q": query, "format": "json", "language": "zh-CN", "safesearch": 0}
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.get(self._url, params=params)
                response.raise_for_status()
                data = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise WebSearchError(
                message="网页搜索失败", details={"provider": "searxng", "error": str(exc)}
            ) from exc
        results = data.get("results") if isinstance(data, dict) else None
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
