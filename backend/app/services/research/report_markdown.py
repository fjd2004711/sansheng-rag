"""The research report as Markdown for the chat window: the whole analysis, readable where the question was asked."""

from __future__ import annotations

import json

from app.services.research.audit import LEVEL_LABELS, AuditedClaim
from app.services.research.report_diagrams import mermaid_of
from app.services.research.report_models import ChartSeries, DataTable, Diagram, ResearchReport
from app.services.research.report_text import BASIS_LABELS, SYNTHESIS_NOTE, verification_overview

_ICONS = {"verified": "✅", "single_source": "ℹ️", "disputed": "⚠️", "unverified": "❓"}


def render_chat_markdown(report: ResearchReport, *, report_id: str | None = None) -> str:
    lines: list[str] = [
        f"# {report.title}",
        "",
        f"**核验概况**：{verification_overview(report)}",
        "",
    ]
    if report.summary.strip():
        lines += ["## 核心结论", "", report.summary.strip(), ""]
        lines += _claim_notes(report.summary_claims)
    if report.diagrams:
        lines += ["## 图示", ""]
        for diagram in report.diagrams:
            lines += [f"**{diagram.title}**", "", _diagram_block(diagram), ""]
            if diagram.caption:
                lines += [f"*{diagram.caption}*", ""]
    for section in report.sections:
        lines += [f"## {section.heading}", ""]
        if section.body.strip():
            lines += [section.body.strip(), ""]
        if section.table:
            lines += [_table(section.table), ""]
        if section.chart:
            lines += [_chart_block(section.chart), ""]
        if section.analysis.strip():
            lines += ["**分析**", "", section.analysis.strip(), ""]
        lines += _claim_notes(section.claims)
    if report.insights.strip():
        lines += ["## 综合研判", ""]
        if report.audience:
            lines += [f"*写给：{report.audience}*", ""]
        lines += [report.insights.strip(), ""]
        lines += _claim_notes(report.insight_claims)
    if report.recommendations:
        lines += ["## 行动建议", "", f"*{SYNTHESIS_NOTE}*", ""]
        for i, rec in enumerate(report.recommendations, start=1):
            lines.append(f"{i}. **[{rec.priority}优先级] {rec.action}**")
            if rec.reason:
                lines.append(f"   - 依据：{rec.reason}")
            if rec.caveat:
                lines.append(f"   - 前提与风险：{rec.caveat}")
            lines.append(f"   - 可靠程度：{BASIS_LABELS[rec.basis]}")
        lines.append("")
    if report.caveats:
        lines += ["## 争议与不确定", "", *(f"- {c}" for c in report.caveats), ""]
    if report_id:
        lines += [
            "---",
            f"完整报告（含趋势图、逐条核实表和方法说明）：[在线查看](/reports?id={report_id})"
            f" · [下载 Word](/api/v1/reports/{report_id}/download?format=docx)"
            f" · [下载 PDF](/api/v1/reports/{report_id}/download?format=pdf)",
        ]
    return "\n".join(lines).strip()


def _diagram_block(diagram: Diagram) -> str:
    """The framework is a Mermaid flowchart; a timeline is drawn by the chat itself (Mermaid's looks poor)."""
    if diagram.kind == "timeline":
        payload = {"events": [e.model_dump() for e in diagram.events]}
        return "```timeline\n" + json.dumps(payload, ensure_ascii=False) + "\n```"
    return "```mermaid\n" + mermaid_of(diagram) + "\n```"


def _chart_block(chart: ChartSeries) -> str:
    """A fenced ``chart`` block the chat window draws as a real chart (the text stays readable without it).

    Sources are a plain string, not a list, so the chat's citation rewriting never mistakes ``[3]`` for a citation.
    """
    payload = {
        "kind": chart.kind,
        "title": chart.title,
        "unit": chart.unit,
        "labels": chart.labels,
        "values": chart.values,
        "sources": ",".join(str(n) for n in chart.sources),
    }
    return "```chart\n" + json.dumps(payload, ensure_ascii=False) + "\n```"


def _claim_notes(claims: list[AuditedClaim]) -> list[str]:
    """Only the claims a reader should be careful with; the verified ones are counted in the overview."""
    flagged = [c for c in claims if c.level != "verified" or c.stale]
    if not flagged:
        return []
    out = ["> **需要留意的说法**"]
    for c in flagged:
        suffix = "（可能过时）" if c.stale and c.level == "verified" else ""
        out.append(f"> - {_ICONS[c.level]} {LEVEL_LABELS[c.level]}{suffix}：{c.claim}——{c.reason}")
    return [*out, ""]


def _cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ")


def _table(table: DataTable) -> str:
    head = "| " + " | ".join(_cell(c) for c in table.columns) + " |"
    rule = "|" + "---|" * len(table.columns)
    rows = ["| " + " | ".join(_cell(c) for c in row) + " |" for row in table.rows]
    return "\n".join([f"**{table.caption}**", "", head, rule, *rows])
