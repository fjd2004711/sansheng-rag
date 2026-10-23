"""Which backing sources are really independent of each other.

Ten sites repeating one wire story are one witness, not ten. Two sources belong to the same group when they
share a site, attribute the text to the same origin ("据新华社报道", "转引网络消息") or are published by that
origin themselves, or their texts are near copies. Rule-based, so a reviewer can reproduce every grouping.
"""

from __future__ import annotations

import re
from collections.abc import Sequence

from app.services.research.credibility import registrable_domain
from app.services.research.models import WebSource

# Wire services / origins that other outlets republish; their own domains count as that origin.
_ORIGIN_DOMAINS = {
    "news.cn": "新华社",
    "xinhuanet.com": "新华社",
    "chinanews.com.cn": "中新社",
    "chinanews.com": "中新社",
    "reuters.com": "路透社",
    "apnews.com": "美联社",
}
_ORIGIN_NAMES = ("新华社", "中新社", "中新网", "路透社", "路透", "美联社", "人民日报", "央视新闻", "法新社", "彭博社")
_ATTRIBUTION = re.compile(r"(?:据|转自|转引自?|引自|来源[:：]|综合自?|编译自)\s*([^\s，。,.:：；;、（）()]{2,10})")
_UNNAMED = re.compile(r"网络消息|网传|网友爆料|自媒体|社交媒体")
_SIMILARITY = 0.7


def origin_of(source: WebSource) -> str | None:
    """Named origin of the text: a credit to a wire service anywhere, an unnamed rumour near the start, or the wire's own site."""
    head = source.content[:80]
    # A credit line often closes the piece ("以上内容综合自新华社报道"), so named origins are looked for everywhere.
    for match in _ATTRIBUTION.finditer(source.content):
        named = next((n for n in _ORIGIN_NAMES if n in match.group(1)), None)
        if named:
            return "中新社" if named == "中新网" else ("路透社" if named == "路透" else named)
        if match.start() < len(head) and _UNNAMED.search(match.group(1)):
            return "网络消息"
    if _UNNAMED.search(head):
        return "网络消息"
    if any(name in head[:30] for name in _ORIGIN_NAMES):
        return next(n for n in _ORIGIN_NAMES if n in head[:30])
    return _ORIGIN_DOMAINS.get(registrable_domain(source.url))


def _shingles(text: str) -> set[str]:
    chars = re.sub(r"\W+", "", text.lower())
    return {chars[i : i + 4] for i in range(len(chars) - 3)}


def _near_copy(a: WebSource, b: WebSource) -> bool:
    sa, sb = _shingles(a.content), _shingles(b.content)
    if not sa or not sb:
        return False
    return len(sa & sb) / len(sa | sb) >= _SIMILARITY


def independent_groups(sources: Sequence[WebSource]) -> list[list[WebSource]]:
    """Connected components of 'same site / same origin / near copy'; order follows the first member."""
    parent = list(range(len(sources)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    origins = [origin_of(s) for s in sources]
    domains = [registrable_domain(s.url) for s in sources]
    for i in range(len(sources)):
        for j in range(i + 1, len(sources)):
            if (
                domains[i] == domains[j]
                or (origins[i] is not None and origins[i] == origins[j])
                or _near_copy(sources[i], sources[j])
            ):
                parent[find(j)] = find(i)
    groups: dict[int, list[WebSource]] = {}
    for i, source in enumerate(sources):
        groups.setdefault(find(i), []).append(source)
    return list(groups.values())
