"""Render a research report as a Word document."""

from __future__ import annotations

import io

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

from app.services.research.audit import LEVEL_LABELS
from app.services.research.report_chart import chart_png
from app.services.research.report_models import DataTable, ResearchReport
from app.services.research.report_text import (
    BASIS_LABELS,
    LEVEL_RULES,
    SYNTHESIS_NOTE,
    TIER_NAMES,
    blocks,
    reference_groups,
    verification_overview,
)

_FONT = "Microsoft YaHei"
_NUMERALS = "一二三四五六七八九十"


def render_docx(report: ResearchReport) -> bytes:
    doc = Document()
    _base_style(doc)
    title = doc.add_heading(report.title, level=0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    meta = doc.add_paragraph(
        f"生成时间：{report.generated_at[:16].replace('T', ' ')}　·　来源 {len(reference_groups(report))} 个网页"
    )
    meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _note(doc, verification_overview(report))

    doc.add_heading("一、核心结论", level=1)
    _markdown(doc, report.summary)
    for i, section in enumerate(report.sections, start=2):
        doc.add_heading(f"{_numeral(i)}、{section.heading}", level=1)
        _markdown(doc, section.body)
        if section.table:
            _table(doc, section.table)
        if section.chart:
            doc.add_picture(io.BytesIO(chart_png(section.chart)), width=Cm(15))
        if section.analysis:
            doc.add_heading("分析", level=2)
            _markdown(doc, section.analysis)

    n = len(report.sections) + 2
    if report.insights.strip():
        doc.add_heading(f"{_numeral(n)}、综合研判", level=1)
        if report.audience:
            _note(doc, f"写给：{report.audience}")
        _markdown(doc, report.insights)
        n += 1
    if report.recommendations:
        doc.add_heading(f"{_numeral(n)}、行动建议", level=1)
        _note(doc, SYNTHESIS_NOTE)
        for i, rec in enumerate(report.recommendations, start=1):
            paragraph = doc.add_paragraph()
            paragraph.add_run(f"{i}. [{rec.priority}优先级] {rec.action}").bold = True
            for label, text in (
                ("依据", rec.reason),
                ("前提与风险", rec.caveat),
                ("可靠程度", BASIS_LABELS[rec.basis]),
            ):
                if text:
                    doc.add_paragraph(f"{label}：{text}", style="List Bullet")
        n += 1
    doc.add_heading(f"{_numeral(n)}、争议与不确定", level=1)
    if report.caveats:
        for note in report.caveats:
            doc.add_paragraph(note, style="List Bullet")
    else:
        doc.add_paragraph("逐条核验没有发现有争议、未能核实或可能过时的内容。")

    doc.add_heading("附录一  逐条核实表", level=1)
    rows = [
        [
            heading,
            claim.claim,
            LEVEL_LABELS[claim.level] + ("（可能过时）" if claim.stale else ""),
            "".join(f"[{i}]" for i in claim.citation_indices) or "—",
            claim.reason,
        ]
        for heading, claims in [
            ("核心结论", report.summary_claims),
            *((s.heading, s.claims) for s in report.sections),
            ("综合研判", report.insight_claims),
            *((f"建议：{r.action[:16]}", r.premises) for r in report.recommendations),
        ]
        for claim in claims
    ]
    if rows:
        _table(
            doc,
            DataTable(caption="", columns=["章节", "说法", "核实等级", "依据", "说明"], rows=rows),
        )
    doc.add_heading("附录二  方法说明", level=1)
    m = report.method
    tiers = "、".join(f"{TIER_NAMES.get(k, k)} {v} 个" for k, v in m.sources_by_tier.items())
    for line in [
        f"检索词：{'；'.join(m.queries)}",
        f"阅读网页 {m.pages_read} 个（读到全文 {m.full_text_pages} 个）；来源等级分布：{tiers}。",
        f"数据点：保留 {m.data_points_kept} 条（原句逐字核对通过），剔除 {m.data_points_rejected} 条。",
        f"生成模型：{m.model}；开始 {m.started_at[:16].replace('T', ' ')}，完成 {m.finished_at[:16].replace('T', ' ')}。",
        *LEVEL_RULES,
    ]:
        doc.add_paragraph(line, style="List Bullet")
    doc.add_heading("参考来源", level=1)
    for indices, name, tier, url, dates in reference_groups(report):
        p = doc.add_paragraph()
        p.add_run(f"{indices} ").bold = True
        p.add_run(f"{name}（{tier}）{url}" + (f"　{dates}" if dates else ""))
    buffer = io.BytesIO()
    doc.save(buffer)
    return buffer.getvalue()


def _base_style(doc: Document) -> None:
    for name in ("Normal", "Title", "Heading 1", "Heading 2", "List Bullet"):
        style = doc.styles[name]
        style.font.name = _FONT
        style.element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:eastAsia"), _FONT)
    doc.styles["Normal"].font.size = Pt(10.5)
    for section in doc.sections:
        section.left_margin = section.right_margin = Cm(2.2)


def _markdown(doc: Document, text: str) -> None:
    for block in blocks(text):
        p = doc.add_paragraph(style="List Bullet" if block.kind == "li" else None)
        for run_text, bold in block.runs:
            p.add_run(run_text).bold = bold


def _note(doc: Document, text: str) -> None:
    run = doc.add_paragraph().add_run(text)
    run.italic = True
    run.font.color.rgb = RGBColor(0x55, 0x55, 0x55)


def _table(doc: Document, table: DataTable) -> None:
    if table.caption:
        caption = doc.add_paragraph()
        caption.add_run(table.caption).bold = True
    grid = doc.add_table(rows=1, cols=len(table.columns))
    grid.style = "Table Grid"
    for cell, name in zip(grid.rows[0].cells, table.columns, strict=True):
        cell.text = ""
        cell.paragraphs[0].add_run(name).bold = True
    for row in table.rows:
        for cell, value in zip(grid.add_row().cells, row, strict=True):
            cell.text = value
            for paragraph in cell.paragraphs:
                for run in paragraph.runs:
                    run.font.size = Pt(9)
    doc.add_paragraph()


def _numeral(n: int) -> str:
    if n <= 10:
        return _NUMERALS[n - 1]
    return "十" + _NUMERALS[n - 11] if n < 20 else str(n)
