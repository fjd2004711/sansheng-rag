"""Render a research report as PDF (reportlab) with an embedded CJK font."""

from __future__ import annotations

import io
from functools import lru_cache
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.services.research.audit import LEVEL_LABELS
from app.services.research.report_chart import chart_png
from app.services.research.report_diagrams import diagram_png
from app.services.research.report_fonts import cjk_font_path
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

_NUMERALS = "一二三四五六七八九十"


@lru_cache(maxsize=1)
def _font() -> str:
    path = cjk_font_path()
    if path:
        pdfmetrics.registerFont(TTFont("ReportCJK", path, subfontIndex=0))
        pdfmetrics.registerFontFamily(
            "ReportCJK",
            normal="ReportCJK",
            bold="ReportCJK",
            italic="ReportCJK",
            boldItalic="ReportCJK",
        )
        return "ReportCJK"
    # Fallback without an installed TrueType font: a standard (non-embedded) CID font.
    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    return "STSong-Light"


def _styles() -> dict[str, ParagraphStyle]:
    font = _font()
    base = ParagraphStyle(
        "base", fontName=font, fontSize=10.5, leading=17, wordWrap="CJK", spaceAfter=6
    )
    return {
        "title": ParagraphStyle(
            "title", parent=base, fontSize=20, leading=28, alignment=TA_CENTER, spaceAfter=8
        ),
        "meta": ParagraphStyle(
            "meta", parent=base, fontSize=9, textColor=colors.grey, alignment=TA_CENTER
        ),
        "note": ParagraphStyle(
            "note", parent=base, fontSize=9.5, textColor=colors.HexColor("#555555")
        ),
        "h1": ParagraphStyle(
            "h1",
            parent=base,
            fontSize=15,
            leading=22,
            spaceBefore=12,
            spaceAfter=8,
            textColor=colors.HexColor("#1e3a8a"),
        ),
        "h2": ParagraphStyle("h2", parent=base, fontSize=12, leading=18, spaceBefore=6),
        "body": base,
        "li": ParagraphStyle("li", parent=base, leftIndent=12, bulletIndent=2),
        "cell": ParagraphStyle("cell", parent=base, fontSize=8.5, leading=12, spaceAfter=0),
        "caption": ParagraphStyle("caption", parent=base, fontSize=9.5, spaceBefore=4),
    }


def render_pdf(report: ResearchReport) -> bytes:
    s = _styles()
    story: list = [
        Paragraph(escape(report.title), s["title"]),
        Paragraph(
            escape(
                f"生成时间：{report.generated_at[:16].replace('T', ' ')} · 来源 {len(reference_groups(report))} 个网页"
            ),
            s["meta"],
        ),
        Spacer(1, 6),
        Paragraph(escape(verification_overview(report)), s["note"]),
        Paragraph("一、核心结论", s["h1"]),
        *_markdown(report.summary, s),
    ]
    for diagram in report.diagrams:
        story += [
            Image(
                io.BytesIO(diagram_png(diagram)),
                width=15 * cm,
                height=7.5 * cm,
                kind="proportional",
            ),
            Paragraph(escape(diagram.caption), s["note"]),
        ]
    for i, section in enumerate(report.sections, start=2):
        story += [
            Paragraph(escape(f"{_numeral(i)}、{section.heading}"), s["h1"]),
            *_markdown(section.body, s),
        ]
        if section.table:
            story += _table(section.table, s, widths=[4, 3, 2.5, 2.5, 1.6])
        if section.chart:
            story.append(
                Image(io.BytesIO(chart_png(section.chart)), width=15 * cm, height=7.5 * cm)
            )
        if section.analysis:
            story += [Paragraph("分析", s["h2"]), *_markdown(section.analysis, s)]

    n = len(report.sections) + 2
    if report.insights.strip():
        story.append(Paragraph(escape(f"{_numeral(n)}、综合研判"), s["h1"]))
        if report.audience:
            story.append(Paragraph(escape(f"写给：{report.audience}"), s["note"]))
        story += _markdown(report.insights, s)
        n += 1
    if report.recommendations:
        story += [
            Paragraph(escape(f"{_numeral(n)}、行动建议"), s["h1"]),
            Paragraph(escape(SYNTHESIS_NOTE), s["note"]),
        ]
        for i, rec in enumerate(report.recommendations, start=1):
            story.append(Paragraph(escape(f"{i}. [{rec.priority}优先级] {rec.action}"), s["h2"]))
            for label, text in (
                ("依据", rec.reason),
                ("前提与风险", rec.caveat),
                ("可靠程度", BASIS_LABELS[rec.basis]),
            ):
                if text:
                    story.append(Paragraph(escape(f"{label}：{text}"), s["li"], bulletText="•"))
        n += 1
    story.append(Paragraph(escape(f"{_numeral(n)}、争议与不确定"), s["h1"]))
    notes = report.caveats or ["逐条核验没有发现有争议、未能核实或可能过时的内容。"]
    story += [Paragraph(escape(note), s["li"], bulletText="•") for note in notes]

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
            *((x.heading, x.claims) for x in report.sections),
            ("综合研判", report.insight_claims),
            *((f"建议：{r.action[:16]}", r.premises) for r in report.recommendations),
        ]
        for claim in claims
    ]
    story.append(Paragraph("附录一  逐条核实表", s["h1"]))
    if rows:
        story += _table(
            DataTable(caption="", columns=["章节", "说法", "等级", "依据", "说明"], rows=rows),
            s,
            widths=[2.4, 5.2, 1.8, 1.6, 5.6],
        )
    m = report.method
    tiers = "、".join(f"{TIER_NAMES.get(k, k)} {v} 个" for k, v in m.sources_by_tier.items())
    story.append(Paragraph("附录二  方法说明", s["h1"]))
    for line in [
        f"检索词：{'；'.join(m.queries)}",
        f"阅读网页 {m.pages_read} 个（读到全文 {m.full_text_pages} 个）；来源等级分布：{tiers}。",
        f"数据点：保留 {m.data_points_kept} 条（原句逐字核对通过），剔除 {m.data_points_rejected} 条。",
        f"生成模型：{m.model}；开始 {m.started_at[:16].replace('T', ' ')}，完成 {m.finished_at[:16].replace('T', ' ')}。",
        *LEVEL_RULES,
    ]:
        story.append(Paragraph(escape(line), s["li"], bulletText="•"))
    story.append(Paragraph("参考来源", s["h1"]))
    for indices, name, tier, url, dates in reference_groups(report):
        link = (
            f'<link href="{escape(url, {chr(34): "&quot;"})}" color="#1d4ed8">{escape(url)}</link>'
        )
        text = f"<b>{indices}</b> {escape(name)}（{tier}）{link}" + (
            f" {escape(dates)}" if dates else ""
        )
        story.append(Paragraph(text, s["body"]))

    buffer = io.BytesIO()
    SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        title=report.title,
    ).build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buffer.getvalue()


def _footer(canvas, doc) -> None:
    canvas.saveState()
    canvas.setFont(_font(), 8)
    canvas.setFillColor(colors.grey)
    canvas.drawCentredString(A4[0] / 2, 1.2 * cm, f"第 {doc.page} 页")
    canvas.restoreState()


def _markdown(text: str, s: dict[str, ParagraphStyle]) -> list:
    out = []
    for block in blocks(text):
        markup = "".join(f"<b>{escape(t)}</b>" if bold else escape(t) for t, bold in block.runs)
        out.append(
            Paragraph(markup, s["li"], bulletText="•")
            if block.kind == "li"
            else Paragraph(markup, s["body"])
        )
    return out


def _table(table: DataTable, s: dict[str, ParagraphStyle], *, widths: list[float]) -> list:
    data = [[Paragraph(f"<b>{escape(c)}</b>", s["cell"]) for c in table.columns]]
    data += [[Paragraph(escape(v), s["cell"]) for v in row] for row in table.rows]
    grid = Table(data, colWidths=[w * cm for w in widths], repeatRows=1)
    grid.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eff6ff")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    caption = [Paragraph(escape(table.caption), s["caption"])] if table.caption else []
    return [*caption, grid, Spacer(1, 8)]


def _numeral(n: int) -> str:
    if n <= 10:
        return _NUMERALS[n - 1]
    return "十" + _NUMERALS[n - 11] if n < 20 else str(n)
