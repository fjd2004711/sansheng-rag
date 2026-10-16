"""Fetch a web page and keep only its readable article text.

Pages are untrusted input. Every hop (including redirects) must be plain HTTP(S) to a host that resolves
only to public addresses, so a search result cannot make the server read its own network.
"""

from __future__ import annotations

import asyncio
import ipaddress
import logging
import socket
from datetime import UTC, datetime
from urllib.parse import urljoin, urlsplit

import httpx
import trafilatura

from app.services.research.exceptions import UnsafeURLError
from app.services.research.models import WebHit, WebPage

logger = logging.getLogger(__name__)

_MAX_REDIRECTS = 3
_MIN_ARTICLE_CHARS = 200
_TEXT_TYPES = ("text/html", "application/xhtml+xml", "text/plain")
# Many government and news sites reject non-browser clients (HTTP 406/403), so send ordinary browser headers.
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/126.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}


def domain_of(url: str) -> str:
    host = (urlsplit(url).hostname or "").lower()
    return host.removeprefix("www.")


async def assert_public_url(url: str) -> None:
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise UnsafeURLError(message="只能抓取 http/https 网页", details={"url": url})
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(
            parts.hostname, parts.port or None, type=socket.SOCK_STREAM
        )
    except socket.gaierror as exc:
        raise UnsafeURLError(message="网址无法解析", details={"url": url}) from exc
    for info in infos:
        address = ipaddress.ip_address(info[4][0])
        if not address.is_global:
            raise UnsafeURLError(
                message="不允许抓取内网地址", details={"url": url, "address": str(address)}
            )


class PageFetcher:
    def __init__(
        self, *, timeout: float, max_bytes: int, client: httpx.AsyncClient | None = None
    ) -> None:
        self._timeout = timeout
        self._max_bytes = max_bytes
        self._client = client

    async def fetch(self, hit: WebHit) -> WebPage:
        """The page's article text, or the search snippet when the page cannot be read."""
        fetched_at = datetime.now(UTC).isoformat(timespec="seconds")
        try:
            body, content_type, final_url = await self._download(hit.url)
            text, title, published = await asyncio.to_thread(
                _extract, body, content_type, final_url
            )
        except Exception as exc:
            logger.info("research_fetch_failed url=%s error=%s", hit.url, exc)
            text, title, published = "", None, None
        if len(text) < _MIN_ARTICLE_CHARS:
            return WebPage(
                url=hit.url,
                title=hit.title or domain_of(hit.url),
                domain=domain_of(hit.url),
                text=hit.snippet.strip(),
                fetched_at=fetched_at,
                published_at=hit.published_at,
                from_snippet=True,
            )
        return WebPage(
            url=hit.url,
            title=title or hit.title or domain_of(hit.url),
            domain=domain_of(hit.url),
            text=text,
            fetched_at=fetched_at,
            published_at=published or hit.published_at,
        )

    async def _download(self, url: str) -> tuple[bytes, str, str]:
        client = self._client or httpx.AsyncClient(timeout=self._timeout, headers=_HEADERS)
        try:
            for _ in range(_MAX_REDIRECTS + 1):
                await assert_public_url(url)
                async with client.stream("GET", url, follow_redirects=False) as response:
                    if response.is_redirect:
                        target = urljoin(url, response.headers.get("location", ""))
                        if _is_soft_404(url, target):
                            raise ValueError("article redirected to the site home page")
                        url = target
                        continue
                    response.raise_for_status()
                    content_type = (
                        response.headers.get("content-type", "").split(";")[0].strip().lower()
                    )
                    if content_type and not content_type.startswith(_TEXT_TYPES):
                        raise ValueError(f"unsupported content type {content_type}")
                    body = bytearray()
                    async for chunk in response.aiter_bytes():
                        body.extend(chunk)
                        if len(body) > self._max_bytes:
                            raise ValueError("page too large")
                    return bytes(body), content_type, url
            raise ValueError("too many redirects")
        finally:
            if self._client is None:
                await client.aclose()


def _is_soft_404(source: str, target: str) -> bool:
    """A removed article often redirects to the site's home page; that page is not the cited source."""
    return urlsplit(source).path.strip("/") != "" and urlsplit(target).path.strip("/") == ""


def _extract(body: bytes, content_type: str, url: str) -> tuple[str, str | None, str | None]:
    if content_type == "text/plain":
        return body.decode("utf-8", errors="replace").strip(), None, None
    text = (
        trafilatura.extract(
            body, url=url, include_tables=True, include_comments=False, favor_precision=True
        )
        or ""
    )
    metadata = trafilatura.extract_metadata(body, default_url=url)
    title = metadata.title if metadata else None
    published = metadata.date if metadata else None
    return text.strip(), title, published
