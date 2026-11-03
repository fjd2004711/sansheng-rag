"""Figures drawn from the report itself: the evidence map (structure + how well each part held up) and a timeline of
the verified data points. Built by code from checked content, so nothing in them is invented; the same spec becomes
Mermaid for the screen and a PNG for Word / PDF."""

from __future__ import annotations

import io
import re

from app.services.research.audit import AuditedClaim
from app.services.research.report_data import _period_key, display_value
from app.services.research.report_models import (
    Diagram,
    DiagramEvent,
    DiagramNode,
    ResearchReport,
)

_MAX_EVENTS = 8
_DATED = re.compile(r"(19|20)\d{2}")


def _short(text: str, n: int) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= n else text[: n - 1] + "…"


def _ratio(claims: list[AuditedClaim]) -> tuple[int, int]:
    return sum(c.level == "verified" for c in claims), len(claims)


def framework_diagram(report: ResearchReport) -> Diagram | None:
    """Topic → sections (with how many of their claims were verified) → judgment → advice."""
    if len(report.sections) < 2:
        return None
    nodes = [DiagramNode(id="T", label=_short(report.title or report.topic, 22))]
    edges: list[list[str]] = []
    tail = "T"
    last_ids: list[str] = []
    for i, section in enumerate(report.sections, start=1):
        ok, total = _ratio(section.claims)
        tone = (
            "plain"
            if not total
            else "good"
            if ok / total >= 0.6
            else "warn"
            if ok / total >= 0.3
            else "bad"
        )
        label = _short(section.heading, 12) + (f"｜已核实 {ok}/{total}" if total else "")
        nodes.append(DiagramNode(id=f"S{i}", label=label, tone=tone))
        edges.append([tail, f"S{i}"])
        last_ids.append(f"S{i}")
    follow = []
    if report.insights.strip():
        nodes.append(DiagramNode(id="J", label="综合研判"))
        follow.append("J")
    if report.recommendations:
        nodes.append(DiagramNode(id="R", label=f"行动建议（{len(report.recommendations)} 条）"))
        follow.append("R")
    prev = last_ids
    for node_id in follow:
        edges += [[p, node_id] for p in prev]
        prev = [node_id]
    return Diagram(
        kind="framework",
        title="报告结构与证据核实图",
        caption="每章括号内是已核实的说法数 / 该章全部说法数；颜色越绿，依据越充分。",
        nodes=nodes,
        edges=edges,
    )


def timeline_diagram(report: ResearchReport) -> Diagram | None:
    """Verified data points that carry a date, in time order; needs at least three distinct dates."""
    seen: dict[tuple[str, str], DiagramEvent] = {}
    order: dict[tuple[str, str], tuple[int, str]] = {}
    for section in report.sections:
        for p in section.data_points:
            if not p.period or not _DATED.search(p.period):
                continue
            key = (p.period, p.indicator)
            if key in seen:
                continue
            label = f"{_short(p.indicator, 16)} {display_value(p)}"
            seen[key] = DiagramEvent(period=p.period, label=label)
            order[key] = _period_key(p.period)
    if len({k[0] for k in seen}) < 3:
        return None
    # One event per date (the first indicator found), earliest first, capped so the figure stays legible.
    by_period: dict[str, tuple[tuple[int, str], DiagramEvent]] = {}
    for key, event in seen.items():
        by_period.setdefault(key[0], (order[key], event))
    events = [e for _, e in sorted(by_period.values(), key=lambda item: item[0])]
    if len(events) > _MAX_EVENTS:
        step = (len(events) - 1) / (_MAX_EVENTS - 1)
        events = [events[round(i * step)] for i in range(_MAX_EVENTS)]
    return Diagram(
        kind="timeline",
        title="关键数据时间线",
        caption="只列出带日期且经原文逐字核对的数据点。",
        events=events,
    )


def diagrams_for(report: ResearchReport) -> list[Diagram]:
    return [d for d in (framework_diagram(report), timeline_diagram(report)) if d is not None]


# ---- Mermaid (screen) ---------------------------------------------------------------------------------


def _mm(text: str) -> str:
    """Text safe inside a Mermaid label: no quotes, brackets or colons that end the label early."""
    return re.sub(r'["\[\]{}()<>`#;|]', " ", text).replace(":", "：").strip()


def mermaid_of(diagram: Diagram) -> str:
    if diagram.kind == "timeline":
        lines = ["timeline", f"    title {_mm(diagram.title)}"]
        lines += [f"    {_mm(e.period)} : {_mm(e.label)}" for e in diagram.events]
        return "\n".join(lines)
    lines = ["flowchart LR"]
    lines += [f'    {n.id}["{_mm(n.label)}"]' for n in diagram.nodes]
    lines += [f"    {a} --> {b}" for a, b in diagram.edges]
    lines += [
        "    classDef good fill:#e7f6ec,stroke:#2f9e5b,color:#14532d",
        "    classDef warn fill:#fff4dc,stroke:#d4900a,color:#6b4500",
        "    classDef bad fill:#fde8e8,stroke:#d64545,color:#7a1f1f",
    ]
    lines += [f"    class {n.id} {n.tone}" for n in diagram.nodes if n.tone != "plain"]
    return "\n".join(lines)


# ---- PNG (Word / PDF) ------------------------------------------------------------------------------------

_FILL = {"plain": "#f3f4f6", "good": "#e7f6ec", "warn": "#fff4dc", "bad": "#fde8e8"}
_EDGE = {"plain": "#9ca3af", "good": "#2f9e5b", "warn": "#d4900a", "bad": "#d64545"}


def diagram_png(diagram: Diagram) -> bytes:
    import matplotlib

    matplotlib.use("Agg")
    from matplotlib import font_manager
    from matplotlib import pyplot as plt
    from matplotlib.patches import FancyBboxPatch

    from app.services.research.report_fonts import cjk_font_path

    path = cjk_font_path()
    font = font_manager.FontProperties(fname=path) if path else None
    fig, ax = plt.subplots(figsize=(7.2, 3.6), dpi=150)
    try:
        ax.axis("off")
        if diagram.kind == "timeline":
            n = len(diagram.events)
            ax.plot([0, n - 1], [0, 0], color="#9ca3af", linewidth=1.5, zorder=1)
            for i, event in enumerate(diagram.events):
                up = i % 2 == 0
                ax.scatter([i], [0], s=40, color="#2563eb", zorder=2)
                ax.annotate(
                    f"{event.period}\n{_wrap_label(event.label, 9, ' ')}",
                    (i, 0),
                    xytext=(0, 18 if up else -18),
                    textcoords="offset points",
                    ha="center",
                    va="bottom" if up else "top",
                    fontsize=7,
                    fontproperties=font,
                )
            ax.set_xlim(-0.6, n - 0.4)
            ax.set_ylim(-1, 1)
        else:
            columns = _columns(diagram)
            pos: dict[str, tuple[float, float]] = {}
            for c, ids in enumerate(columns):
                for r, node_id in enumerate(ids):
                    pos[node_id] = (c * 2.4, (len(ids) - 1) / 2 * 1.0 - r * 1.0)
            by_id = {n.id: n for n in diagram.nodes}
            for a, b in diagram.edges:
                (x1, y1), (x2, y2) = pos[a], pos[b]
                ax.annotate(
                    "",
                    xy=(x2 - 0.95, y2),
                    xytext=(x1 + 0.95, y1),
                    arrowprops={"arrowstyle": "->", "color": "#9ca3af", "linewidth": 0.8},
                )
            for node_id, (x, y) in pos.items():
                node = by_id[node_id]
                ax.add_patch(
                    FancyBboxPatch(
                        (x - 0.95, y - 0.34),
                        1.9,
                        0.68,
                        boxstyle="round,pad=0.02,rounding_size=0.08",
                        facecolor=_FILL[node.tone],
                        edgecolor=_EDGE[node.tone],
                        linewidth=1,
                    )
                )
                ax.text(
                    x,
                    y,
                    _wrap_label(node.label, 9, "｜"),
                    ha="center",
                    va="center",
                    fontsize=6.5,
                    fontproperties=font,
                )
            ax.set_xlim(-1.2, (len(columns) - 1) * 2.4 + 1.2)
            top = max(len(ids) for ids in columns)
            ax.set_ylim(-(top - 1) / 2 - 0.7, (top - 1) / 2 + 0.7)
        ax.set_title(diagram.title, fontproperties=font, fontsize=10)
        buffer = io.BytesIO()
        fig.savefig(buffer, format="png", bbox_inches="tight")
        return buffer.getvalue()
    finally:
        plt.close(fig)


def _wrap_label(label: str, width: int, sep: str) -> str:
    """Wrap the name part, keep the figure after the last ``sep`` whole on its own line (a number must not split)."""
    head, found, tail = label.rpartition(sep)
    return f"{_wrap(head, width)}\n{tail}" if found else _wrap(label, width)


def _wrap(text: str, width: int) -> str:
    return "\n".join(text[i : i + width] for i in range(0, len(text), width))


def _columns(diagram: Diagram) -> list[list[str]]:
    """Left-to-right layers: a node sits one column right of its furthest predecessor."""
    level: dict[str, int] = {n.id: 0 for n in diagram.nodes}
    for _ in diagram.nodes:
        for a, b in diagram.edges:
            level[b] = max(level[b], level[a] + 1)
    columns: list[list[str]] = [[] for _ in range(max(level.values()) + 1)]
    for node in diagram.nodes:
        columns[level[node.id]].append(node.id)
    return columns
