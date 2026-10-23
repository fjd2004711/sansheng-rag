"""The research report as Markdown for the chat window: the whole analysis, readable where the question was asked."""

from __future__ import annotations

from app.services.research.audit import LEVEL_LABELS, AuditedClaim
from app.services.research.report_models import DataTable, ResearchReport
from app.services.research.report_text import verification_overview

_ICONS = {"verified": "✅", "single_source": "ℹ️", "disputed": "⚠️", "unverified": "❓"}


def render_chat_markdown(report: ResearchReport, *, report_id: str | None = None) -> str:
    lines: list[str] = [f"# {report.title}", "", f"**核验概况**：{verification_overview(report)}", ""]
    if report.summary.strip():
        lines += ["## 核心结论", "", report.summary.strip(), ""]
        lines += _claim_notes(report.summary_claims)
    for section in report.sections:
        lines += [f"## {section.heading}", ""]
        if section.body.strip():
            lines += [section.body.strip(), ""]
        if section.table:
            lines += [_table(section.table), ""]
        if section.chart:
            lines += [f"*趋势图（{section.chart.title}）见完整报告或下载的文件。*", ""]
        if section.analysis.strip():
            lines += ["**分析**", "", section.analysis.strip(), ""]
        lines += _claim_notes(section.claims)
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
