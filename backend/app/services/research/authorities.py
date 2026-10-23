"""Searches aimed straight at the official publisher of a figure.

Free search engines rank aggregator and self-media copies above the original release. A ``site:`` search
for the named authority's own domain reliably returns the original page, so every planned query that names a
known authority also gets an official-site variant, searched first.
"""

from __future__ import annotations

# Authority name as the planner writes it → the domain it publishes on.
AUTHORITY_DOMAINS: dict[str, str] = {
    "国家统计局": "stats.gov.cn",
    "统计局": "stats.gov.cn",
    "教育部": "moe.gov.cn",
    "人社部": "mohrss.gov.cn",
    "人力资源和社会保障部": "mohrss.gov.cn",
    "国家发改委": "ndrc.gov.cn",
    "发改委": "ndrc.gov.cn",
    "工信部": "miit.gov.cn",
    "工业和信息化部": "miit.gov.cn",
    "国家卫健委": "nhc.gov.cn",
    "卫健委": "nhc.gov.cn",
    "财政部": "mof.gov.cn",
    "中国人民银行": "pbc.gov.cn",
    "央行": "pbc.gov.cn",
    "商务部": "mofcom.gov.cn",
    "海关总署": "customs.gov.cn",
    "国务院": "gov.cn",
    "中国气象局": "cma.gov.cn",
    "自然资源部": "mnr.gov.cn",
    "生态环境部": "mee.gov.cn",
    "农业农村部": "moa.gov.cn",
    "住建部": "mohurd.gov.cn",
    "交通运输部": "mot.gov.cn",
    "国家能源局": "nea.gov.cn",
    "国家知识产权局": "cnipa.gov.cn",
    "世界卫生组织": "who.int",
    "世界银行": "worldbank.org",
    "国际货币基金组织": "imf.org",
    "经合组织": "oecd.org",
}
# Longest names first so "国家统计局" wins over "统计局".
_NAMES = sorted(AUTHORITY_DOMAINS, key=len, reverse=True)


def official_site_query(query: str) -> str | None:
    """``"教育部 2025届毕业生规模"`` → ``"site:moe.gov.cn 2025届毕业生规模"``; None when no authority is named."""
    for name in _NAMES:
        if name in query:
            rest = " ".join(query.replace(name, " ").split())
            return f"site:{AUTHORITY_DOMAINS[name]} {rest}".strip() if rest else None
    return None


def with_official_variants(queries: list[str], *, limit: int) -> list[str]:
    """Official-site variants first, then the planned queries; at most ``limit`` in all, no duplicates."""
    variants = [v for v in (official_site_query(q) for q in queries) if v]
    return list(dict.fromkeys([*variants, *queries]))[:limit]
