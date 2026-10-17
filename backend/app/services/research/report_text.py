"""Split the model's light Markdown (paragraphs, "- " bullets, **bold**) into blocks for both renderers."""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.services.research.audit import LEVEL_LABELS
from app.services.research.report_models import ResearchReport


@dataclass
class Block:
    kind: str  # "p" | "li"
    runs: list[tuple[str, bool]]  # (text, bold)


def blocks(markdown: str) -> list[Block]:
    out: list[Block] = []
    paragraph: list[str] = []

    def flush() -> None:
        if paragraph:
            out.append(Block("p", _runs(" ".join(paragraph))))
            paragraph.clear()

    for raw in markdown.splitlines():
        line = raw.strip()
        if not line:
            flush()
            continue
        line = re.sub(r"^#{1,6}\s*", "", line)
        bullet = re.match(r"^(?:[-*•]|\d+[.、)])\s+(.*)", line)
        if bullet:
            flush()
            out.append(Block("li", _runs(bullet.group(1))))
        else:
            paragraph.append(line)
    flush()
    return out


def _runs(text: str) -> list[tuple[str, bool]]:
    parts = re.split(r"(\*\*[^*]+\*\*)", text)
    return [
        (p[2:-2], True) if p.startswith("**") and p.endswith("**") else (p, False)
        for p in parts
        if p
    ]


def verification_overview(report: ResearchReport) -> str:
    claims = report.all_claims()
    if not claims:
        return "本报告没有拆出可逐条核验的说法。"
    counts = {level: sum(c.level == level for c in claims) for level in LEVEL_LABELS}
    parts = "、".join(f"{LEVEL_LABELS[k]} {v} 条" for k, v in counts.items() if v)
    return f"全文共逐条核验 {len(claims)} 条说法：{parts}。有争议、未能核实和可能过时的内容列在“争议与不确定”中。"


TIER_NAMES = {
    "authoritative": "权威来源",
    "reference": "参考来源",
    "general": "一般网站",
    "low": "低可信来源",
}

LEVEL_RULES = [
    "已核实：有全文读到的权威来源（政府、教育科研机构、标准与国际组织等）支持，或至少两个独立网站一致且不全是低可信来源。",
    "单一来源：只有一个网站提到，或只有低可信来源提到，或权威来源只读到搜索摘要。",
    "有争议：有可信来源给出不同的数字或结论，双方出处均已列出。",
    "未能核实：没有找到明确陈述这一点的资料。",
    "可能过时：描述当前状况、没有写明时间的信息，支持它的资料发布已超过一年。",
    "数据表中的每个数字都要求在来源原文中逐字出现（引用原句核对），无法核对的数据已剔除。",
]


def reference_groups(report: ResearchReport) -> list[tuple[str, str, str, str, str]]:
    """(indices, title, tier, url, dates) per page, in order of first citation number."""
    groups: dict[str, list] = {}
    for source in report.sources:
        group = groups.setdefault(source.url, [[], source])
        group[0].append(source.index)
    rows = []
    for url, (indices, source) in groups.items():
        dates = "；".join(
            part
            for part in (
                f"发布 {source.published_at}" if source.published_at else "",
                f"访问 {source.fetched_at[:10]}" if source.fetched_at else "",
                "仅搜索摘要" if source.from_snippet else "",
            )
            if part
        )
        rows.append(
            (
                "".join(f"[{i}]" for i in indices),
                source.title,
                TIER_NAMES.get(source.tier, ""),
                url,
                dates,
            )
        )
    return rows
