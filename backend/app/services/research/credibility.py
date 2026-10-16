"""How much a web source can be trusted, from its address alone.

Tiers are deliberately coarse and rule-based so a reviewer can see exactly why a source counted:
authoritative (government, education/research institutions, standards and intergovernmental bodies,
peer-reviewed publishers) > reference (encyclopedias, established news organisations) > general >
low (self-published accounts, forums, Q&A, user-uploaded documents, video platforms, AI-generated answers).
"""

from __future__ import annotations

from typing import Literal
from urllib.parse import urlsplit

from tld import get_fld

Tier = Literal["authoritative", "reference", "general", "low"]

TIER_LABELS: dict[str, str] = {
    "authoritative": "权威来源",
    "reference": "参考来源",
    "general": "一般网站",
    "low": "低可信来源",
}
TIER_RANK: dict[str, int] = {"authoritative": 0, "reference": 1, "general": 2, "low": 3}

_AUTHORITATIVE_SUFFIXES = (
    ".gov.cn",
    ".gov",
    ".mil",
    ".edu.cn",
    ".edu",
    ".ac.cn",
    ".org.cn",
    ".gov.uk",
    ".ac.uk",
    ".gov.hk",
    ".edu.hk",
    ".gc.ca",
    ".gov.au",
    ".edu.au",
    ".europa.eu",
    ".int",
)
# .org.cn is mostly institutes and associations (e.g. typhoon.org.cn of the China Meteorological Administration).
_AUTHORITATIVE_DOMAINS = {
    "who.int",
    "un.org",
    "worldbank.org",
    "imf.org",
    "oecd.org",
    "iso.org",
    "iec.ch",
    "itu.int",
    "wmo.int",
    "nature.com",
    "science.org",
    "cell.com",
    "thelancet.com",
    "nejm.org",
    "bmj.com",
    "pnas.org",
    "springer.com",
    "sciencedirect.com",
    "wiley.com",
    "ieee.org",
    "acm.org",
    "cnki.net",
    "nih.gov",
    "cdc.gov",
}
_REFERENCE_DOMAINS = {
    "wikipedia.org",
    "britannica.com",
    "baike.baidu.com",
    "baike.so.com",
    "baike.sogou.com",
    "xinhuanet.com",
    "news.cn",
    "people.com.cn",
    "cctv.com",
    "cctv.cn",
    "chinadaily.com.cn",
    "chinanews.com.cn",
    "gmw.cn",
    "ce.cn",
    "cnr.cn",
    "thepaper.cn",
    "caixin.com",
    "yicai.com",
    "21jingji.com",
    "jiemian.com",
    "reuters.com",
    "apnews.com",
    "bbc.com",
    "bbc.co.uk",
    "nytimes.com",
    "ft.com",
    "economist.com",
    "wsj.com",
    "bloomberg.com",
    "theguardian.com",
    "nhk.or.jp",
    "arxiv.org",
}
_LOW_DOMAINS = {
    "zhihu.com",
    "weibo.com",
    "weibo.cn",
    "toutiao.com",
    "bilibili.com",
    "douyin.com",
    "kuaishou.com",
    "xiaohongshu.com",
    "csdn.net",
    "jianshu.com",
    "douban.com",
    "reddit.com",
    "quora.com",
    "medium.com",
    "blogspot.com",
    "wordpress.com",
    "substack.com",
    "youtube.com",
    "360doc.com",
    "doc88.com",
    "docin.com",
    "book118.com",
    "mbalib.com",
}
# Hosts on a mainstream domain whose content is user-published (self-media, Q&A, uploaded documents).
_LOW_HOSTS = {
    "mp.weixin.qq.com",
    "baijiahao.baidu.com",
    "tieba.baidu.com",
    "zhidao.baidu.com",
    "wenku.baidu.com",
    "jingyan.baidu.com",
    "wenku.so.com",
    "wenda.so.com",
    "k.sina.com.cn",
    "new.qq.com",
    # AI-generated answer pages are machine summaries, not sources.
    "ai.so.com",
    "chat.baidu.com",
}
# Self-media sections of portals: sohu.com/a/…, 163.com/dy/…
_LOW_PATH_PREFIXES = {"sohu.com": ("/a/",), "163.com": ("/dy/",)}


def registrable_domain(url: str) -> str:
    """``news.example.co.uk`` → ``example.co.uk``; two pages on the same site are not independent."""
    host = (urlsplit(url).hostname or "").lower()
    return get_fld(url, fail_silently=True) or host.removeprefix("www.")


def source_tier(url: str) -> Tier:
    parts = urlsplit(url)
    host = (parts.hostname or "").lower().removeprefix("www.")
    site = registrable_domain(url)
    if host in _LOW_HOSTS or site in _LOW_DOMAINS:
        return "low"
    if any(parts.path.startswith(prefix) for prefix in _LOW_PATH_PREFIXES.get(site, ())):
        return "low"
    if host in _REFERENCE_DOMAINS or site in _REFERENCE_DOMAINS:
        return "reference"
    if site in _AUTHORITATIVE_DOMAINS or any(
        ("." + host).endswith(suffix) for suffix in _AUTHORITATIVE_SUFFIXES
    ):
        return "authoritative"
    return "general"
