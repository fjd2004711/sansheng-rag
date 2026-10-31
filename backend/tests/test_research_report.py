"""Research reports: verbatim data checks, rendering, the build pipeline and the service rules."""

import io
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pymupdf
import pytest
from docx import Document as DocxDocument

from app.core.exceptions import BadRequestError, NotFoundError, RateLimitError
from app.schemas.research_report import ResearchReportCreate
from app.services import research_report as report_service_module
from app.services.research import report_builder
from app.services.research.audit import AuditedClaim, ExtractedClaim
from app.services.research.models import WebPage, WebSource
from app.services.research.report_data import (
    data_table,
    trend_chart,
    unsupported_numbers,
    verify_data_points,
)
from app.services.research.report_docx import render_docx
from app.services.research.report_models import (
    DataPoint,
    OutlineSection,
    ReportMethod,
    ReportOutline,
    ReportSection,
    ResearchReport,
)
from app.services.research.report_pdf import render_pdf
from app.services.research.report_text import blocks, reference_groups
from app.services.research_report import ResearchReportService
from tests.test_research import FakeRetrieval

SOURCE = WebSource(
    index=1,
    title="教育部新闻",
    url="https://www.moe.gov.cn/a",
    domain="moe.gov.cn",
    content="2025届全国普通高校毕业生规模预计达 1222 万人，同比增加 43 万人。",
    fetched_at="2026-10-16T10:00:00",
    tier="authoritative",
)


def _point(value: str, quote: str, *, period: str = "2025届", source: int = 1) -> DataPoint:
    return DataPoint(
        indicator="毕业生人数", value=value, unit="万人", period=period, source=source, quote=quote
    )


# ---- verbatim data checks -----------------------------------------------------------------------


def test_verify_keeps_point_whose_quote_is_verbatim_in_source() -> None:
    kept, rejected = verify_data_points([_point("1222", "毕业生规模预计达1222万人")], {1: SOURCE})
    assert len(kept) == 1
    assert rejected == 0


def test_verify_rejects_quote_not_in_source() -> None:
    kept, rejected = verify_data_points([_point("1300", "毕业生规模预计达1300万人")], {1: SOURCE})
    assert kept == []
    assert rejected == 1


def test_verify_rejects_value_missing_from_its_quote() -> None:
    kept, _ = verify_data_points([_point("1250", "毕业生规模预计达 1222 万人")], {1: SOURCE})
    assert kept == []


def test_verify_rejects_unknown_source() -> None:
    kept, rejected = verify_data_points([_point("1222", "1222 万人", source=9)], {1: SOURCE})
    assert (kept, rejected) == ([], 1)


def test_verify_ignores_width_spacing_and_markdown_emphasis() -> None:
    source = SOURCE.model_copy(update={"content": "就业率为 **９５．５%**，较上年提高。"})
    kept, _ = verify_data_points([_point("95.5%", "就业率为95.5%")], {1: source})
    assert len(kept) == 1


def test_trend_chart_needs_three_periods_and_sorts_by_year() -> None:
    points = [
        _point(v, "q", period=p)
        for p, v in [("2025届", "1222"), ("2023届", "1158"), ("2024届", "1179")]
    ]
    chart = trend_chart(points)
    assert chart is not None
    assert chart.labels == ["2023届", "2024届", "2025届"]
    assert chart.values == [1158.0, 1179.0, 1222.0]
    assert trend_chart(points[:2]) is None


def test_data_table_lists_value_unit_and_source() -> None:
    table = data_table("规模", [_point("1222", "q")])
    assert table is not None
    assert table.rows == [["毕业生人数", "1222万人", "2025届", "—", "[1]"]]


def test_unsupported_numbers_finds_numbers_absent_from_sources() -> None:
    assert unsupported_numbers("规模达 1222 万人 [1]，就业率 88.5% [2]。", SOURCE.content) == [
        "88.5"
    ]


def test_blocks_split_paragraphs_bullets_and_bold() -> None:
    parsed = blocks("第一段 **重点**。\n\n- 要点一\n- 要点二")
    assert [b.kind for b in parsed] == ["p", "li", "li"]
    assert parsed[0].runs == [("第一段 ", False), ("重点", True), ("。", False)]


# ---- rendering ----------------------------------------------------------------------------------


def _report() -> ResearchReport:
    points = [
        _point(v, "q", period=p)
        for p, v in [("2023届", "1158"), ("2024届", "1179"), ("2025届", "1222")]
    ]
    claim = AuditedClaim(
        claim="2025届毕业生规模预计1222万人",
        level="verified",
        supported=True,
        citation_indices=[1],
        contradicting=[],
        domains=["moe.gov.cn"],
        reason="权威来源 [1] 原文支持",
    )
    second = SOURCE.model_copy(update={"index": 2, "content": "同比增加 43 万人"})
    return ResearchReport(
        title="大学生就业调研报告",
        topic="大学生就业数据",
        generated_at="2026-10-16T22:30:00+08:00",
        summary="- 2025届毕业生规模预计 **1222万人** [1]。",
        summary_claims=[claim],
        sections=[
            ReportSection(
                heading="毕业生规模",
                body="规模预计达1222万人 [1]。",
                analysis="规模持续扩大（推测）。",
                data_points=points,
                table=data_table("毕业生规模", points),
                chart=trend_chart(points),
                claims=[claim],
            )
        ],
        caveats=["【毕业生规模】有争议：示例"],
        method=ReportMethod(
            queries=["2025届 毕业生 教育部"],
            pages_read=5,
            full_text_pages=4,
            sources_by_tier={"authoritative": 1},
            data_points_kept=3,
            data_points_rejected=1,
            model="m",
            started_at="2026-10-16T22:25:00",
            finished_at="2026-10-16T22:30:00",
        ),
        sources=[SOURCE, second],
    )


def test_reference_groups_merge_passages_of_one_page() -> None:
    assert reference_groups(_report())[0][:4] == (
        "[1][2]",
        "教育部新闻",
        "权威来源",
        "https://www.moe.gov.cn/a",
    )


def test_render_docx_contains_sections_table_and_references() -> None:
    doc = DocxDocument(io.BytesIO(render_docx(_report())))
    text = "\n".join(p.text for p in doc.paragraphs)
    assert "一、核心结论" in text
    assert "二、毕业生规模" in text
    assert "三、争议与不确定" in text
    assert "https://www.moe.gov.cn/a" in text
    assert any(
        "1222万人" in cell.text for table in doc.tables for row in table.rows for cell in row.cells
    )
    assert len(doc.inline_shapes) == 1  # the trend chart


def test_render_pdf_embeds_chinese_text() -> None:
    pdf = pymupdf.open(stream=render_pdf(_report()), filetype="pdf")
    text = "".join(page.get_text() for page in pdf)
    assert "大学生就业调研报告" in text
    assert "逐条核实表" in text
    assert "1222万人" in text


# ---- build pipeline (fakes) ---------------------------------------------------------------------


_INDEPENDENT_TAILS = (
    "本站记者走访多所高校，采访了就业指导中心负责人，梳理了各地促进就业的新举措。",
    "专家认为，扩大基层岗位供给和完善技能培训，将有助于缓解结构性矛盾并稳定预期。",
    "调查显示，新兴行业吸纳的毕业生比例持续上升，传统制造业招聘需求总体保持平稳。",
)


class FakeResearch:
    """Stands in for ResearchService: gather() indexes one page per query into the run corpus."""

    def __init__(
        self,
        retrieval: FakeRetrieval,
        host: str = "www.moe{n}.gov.cn",
        lead: str = "2025届全国普通高校毕业生规模预计达1222万人，同比增加43万人。",
    ) -> None:
        self.retrieval = retrieval
        self.host = host
        self.lead = lead
        self.gathered: list[list[str]] = []

    def new_corpus(self):
        from app.services.research.corpus import WebCorpus

        return WebCorpus(self.retrieval, chunk_size=500, chunk_overlap=0)

    async def gather(self, queries, corpus, events, *, round_, max_pages=None) -> None:
        self.gathered.append(list(queries))
        pages = [
            WebPage(
                url=f"https://{self.host.format(n=i + 10 * len(self.gathered))}/{round_}",
                title=f"教育部 {q}",
                domain=f"moe{i}.gov.cn",
                # Distinct wording per page: word-for-word copies count as a single independent source.
                text=f"{self.lead}{_INDEPENDENT_TAILS[(len(self.gathered) + i) % len(_INDEPENDENT_TAILS)]}",
                fetched_at="2026-10-16T00:00:00",
            )
            for i, q in enumerate(queries)
        ]
        await corpus.add_pages(pages)
        await events.trace(
            {"step": "web_fetch", "detail": {"pages": [{"full_text": True} for _ in pages]}}
        )


@pytest.mark.anyio
async def test_build_report_keeps_only_verbatim_data_and_lists_caveats() -> None:
    outline = ReportOutline(
        title="2025届大学生就业调研报告",
        sections=[
            OutlineSection(
                heading="毕业生规模",
                goal="毕业生有多少",
                queries=["毕业生 规模 教育部"],
                indicators=["毕业生人数"],
            )
        ],
    )

    async def fake_extract(section, evidence, *, already_used=None):
        return [
            _point("1222", "毕业生规模预计达1222万人"),
            _point("1300", "毕业生规模预计达1300万人"),  # not in the source: dropped
        ]

    async def fake_write(topic, section, evidence, data):
        return "2025届毕业生规模预计达1222万人 [1]，就业率为 97.1% [1]。", "规模扩大（推测）[1]。"

    async def fake_claims(question, text, evidence, **kw):
        return [ExtractedClaim(claim="2025届毕业生规模预计达1222万人", supporting=[1])]

    progress: list[tuple[str, int]] = []

    async def record(stage: str, percent: int) -> None:
        progress.append((stage, percent))

    research = FakeResearch(FakeRetrieval())
    with (
        patch.object(report_builder, "plan_outline", AsyncMock(return_value=outline)),
        patch.object(report_builder, "extract_data_points", fake_extract),
        patch.object(report_builder, "write_section", fake_write),
        patch.object(
            report_builder,
            "write_summary",
            AsyncMock(return_value="- 毕业生规模预计1222万人 [1]。"),
        ),
        patch.object(report_builder, "extract_claims", fake_claims),
        patch.object(report_builder, "write_synthesis", AsyncMock(return_value=("", "", []))),
    ):
        report = await report_builder.ReportBuilder(research).build("大学生就业数据", record)

    section = report.sections[0]
    assert [p.value for p in section.data_points] == ["1222"]
    assert report.method.data_points_rejected == 1
    assert section.claims[0].level == "verified"
    # A number absent from every source is cut from the text, not just flagged.
    assert "97.1" not in section.body and "1222万人" in section.body
    # The planned query plus its official-site variant (searched first).
    assert report.method.pages_read == 2
    assert report.method.queries[0].startswith("site:moe.gov.cn")
    assert progress[0][0] == "规划报告提纲"
    assert len(research.retrieval.store.deleted) == 1  # run collection cleaned up


@pytest.mark.anyio
async def test_build_report_without_readable_pages_fails_clearly() -> None:
    class EmptyResearch(FakeResearch):
        async def gather(self, queries, corpus, events, *, round_, max_pages=None) -> None:
            return None

    outline = ReportOutline(
        title="t", sections=[OutlineSection(heading="h", goal="g", queries=["q"])]
    )
    with (
        patch.object(report_builder, "plan_outline", AsyncMock(return_value=outline)),
        pytest.raises(Exception) as err,
    ):
        await report_builder.ReportBuilder(EmptyResearch(FakeRetrieval())).build(
            "主题", AsyncMock()
        )
    assert "没有搜到可以读取的网页" in str(err.value)


# ---- service rules ------------------------------------------------------------------------------


def _row(**fields: Any) -> MagicMock:
    row = MagicMock()
    row.user_id = fields.get("user_id", uuid.uuid4())
    row.status = fields.get("status", "done")
    row.report = fields.get("report")
    row.created_at = fields.get("created_at", datetime.now(UTC))
    row.updated_at = fields.get("updated_at")
    return row


@pytest.mark.anyio
async def test_create_while_another_report_runs_raises_rate_limit() -> None:
    repo = MagicMock(
        count_active=AsyncMock(return_value=1), list_by_user=AsyncMock(return_value=([], 0))
    )
    with patch.object(report_service_module, "report_repo", repo), pytest.raises(RateLimitError):
        await ResearchReportService(MagicMock()).create(
            uuid.uuid4(), ResearchReportCreate(topic="大学生就业")
        )


@pytest.mark.anyio
async def test_get_other_users_report_raises_not_found() -> None:
    repo = MagicMock(get_by_id=AsyncMock(return_value=_row()))
    with patch.object(report_service_module, "report_repo", repo), pytest.raises(NotFoundError):
        await ResearchReportService(MagicMock()).get(uuid.uuid4(), uuid.uuid4())


@pytest.mark.anyio
async def test_get_stale_running_report_marks_it_failed() -> None:
    user = uuid.uuid4()
    stale = _row(user_id=user, status="running", updated_at=datetime.now(UTC) - timedelta(hours=2))
    repo = MagicMock(get_by_id=AsyncMock(return_value=stale), update=AsyncMock(return_value=stale))
    with patch.object(report_service_module, "report_repo", repo):
        await ResearchReportService(MagicMock()).get(user, uuid.uuid4())
    assert repo.update.await_args.kwargs["update_data"]["status"] == "failed"


@pytest.mark.anyio
async def test_export_unfinished_report_raises_bad_request() -> None:
    user = uuid.uuid4()
    repo = MagicMock(get_by_id=AsyncMock(return_value=_row(user_id=user, status="running")))
    with patch.object(report_service_module, "report_repo", repo), pytest.raises(BadRequestError):
        await ResearchReportService(MagicMock()).export(user, uuid.uuid4(), "pdf")


@pytest.mark.anyio
async def test_export_finished_report_returns_named_file() -> None:
    user = uuid.uuid4()
    row = _row(user_id=user, report=_report().model_dump(mode="json"))
    repo = MagicMock(get_by_id=AsyncMock(return_value=row))
    with patch.object(report_service_module, "report_repo", repo):
        content, filename, media_type = await ResearchReportService(MagicMock()).export(
            user, uuid.uuid4(), "docx"
        )
    assert filename == "大学生就业调研报告.docx"
    assert media_type.endswith("wordprocessingml.document")
    assert content[:2] == b"PK"


def test_unsupported_numbers_ignores_years() -> None:
    assert unsupported_numbers("2021—2025届的逐年数据未公开。", SOURCE.content) == []


def test_data_table_merges_one_figure_from_several_sources_and_keeps_unit_once() -> None:
    points = [
        DataPoint(
            indicator="毕业生", value="1270万人", unit="万人", period="2026届", source=3, quote="q"
        ),
        DataPoint(
            indicator="毕业生", value="1270", unit="万人", period="2026届", source=5, quote="q"
        ),
    ]
    table = data_table("规模", points)
    assert table is not None
    assert table.rows == [["毕业生", "1270万人", "2026届", "—", "[3][5]"]]


def test_absence_statements_are_not_claims() -> None:
    from app.services.research.audit import is_absence_statement

    assert is_absence_statement("公开资料中未找到全国高校毕业生城乡分布的系统数据")
    assert is_absence_statement("暂未公布2025届就业率")
    assert not is_absence_statement("2025届毕业生规模预计1222万人")


@pytest.mark.anyio
async def test_build_report_corroborates_weak_claims_and_regrades() -> None:
    outline = ReportOutline(
        title="t",
        sections=[
            OutlineSection(
                heading="失业率", goal="青年失业率", queries=["青年 失业率"], indicators=[]
            )
        ],
    )
    calls: list[str] = []

    async def fake_claims(question, text, evidence, **kw):
        calls.append(evidence)
        # First grading: one site only; after the corroborating search a second site backs it.
        return [
            ExtractedClaim(claim="青年失业率为17.8%", supporting=[1] if len(calls) == 1 else [1, 2])
        ]

    research = FakeResearch(
        FakeRetrieval(), host="site{n}.cn", lead="青年失业率为17.8%，处于近年来的较高水平。"
    )
    with (
        patch.object(report_builder, "plan_outline", AsyncMock(return_value=outline)),
        patch.object(report_builder, "extract_data_points", AsyncMock(return_value=[])),
        patch.object(
            report_builder, "write_section", AsyncMock(return_value=("青年失业率为17.8% [1]。", ""))
        ),
        patch.object(report_builder, "write_summary", AsyncMock(return_value="")),
        patch.object(report_builder, "extract_claims", fake_claims),
    ):
        report = await report_builder.ReportBuilder(research).build("青年失业率", AsyncMock())

    assert len(research.gathered) == 2  # the planned search, then one corroboration round
    assert research.gathered[1] == ["青年失业率为17.8% 官方"]
    assert report.sections[0].claims[0].level == "verified"
    assert "青年失业率为17.8% 官方" in report.method.queries


def _claim(text: str, level: str, cites: list[int]) -> AuditedClaim:
    return AuditedClaim(
        claim=text,
        level=level,
        supported=level in ("verified", "single_source"),
        citation_indices=cites,
        contradicting=[],
        domains=[],
        reason=f"{level} reason",
    )


def test_consistent_claims_give_the_same_statement_its_best_grading() -> None:
    first = ReportSection(
        heading="a",
        body="",
        claims=[_claim("2025届全国高校毕业生规模预计为1222万人", "verified", [1, 2])],
    )
    later = ReportSection(
        heading="b",
        body="",
        claims=[_claim("2025届全国普通高校毕业生规模为1222万人", "single_source", [7])],
    )
    other = ReportSection(
        heading="c",
        body="",
        claims=[_claim("2026届全国高校毕业生规模预计为1270万人", "single_source", [8])],
    )
    report_builder.consistent_claims([first, later, other], [])
    assert later.claims[0].level == "verified"
    assert later.claims[0].citation_indices == [1, 2]
    assert "一致" in later.claims[0].reason
    assert other.claims[0].level == "single_source"  # different numbers: a different statement


def test_caveats_summarise_single_source_claims() -> None:
    weak = _claim("某城市吸纳毕业生比例为17.8%", "single_source", [3])
    weak.reason = "只有 sohu.com（低可信来源）一个网站提到"
    section = ReportSection(heading="分布", body="", claims=[weak])
    notes = report_builder.caveats_for([section], [], [SOURCE])
    assert notes == [
        "全文有 1 条说法只找到一个来源（其中 1 条只见于自媒体、论坛等低可信来源），使用前建议对照附录一逐条核实表查看原文"
    ]


def test_chat_markdown_has_conclusions_table_analysis_caveats_and_download_links() -> None:
    from app.services.research import render_chat_markdown

    text = render_chat_markdown(_report(), report_id="abc")
    assert text.startswith("# 大学生就业调研报告")
    for part in ("## 核心结论", "## 毕业生规模", "| 毕业生人数 |", "**分析**", "## 争议与不确定"):
        assert part in text
    assert "/api/v1/reports/abc/download?format=docx" in text
    assert "/reports?id=abc" in text
    # Verified claims are only counted; the notes list what a reader should be careful with.
    assert "需要留意的说法" not in text


def test_chat_markdown_flags_non_verified_claims_and_escapes_table_pipes() -> None:
    from app.services.research import render_chat_markdown
    from app.services.research.report_models import DataTable

    report = _report()
    report.sections[0].claims[0].level = "disputed"
    report.sections[0].claims[0].reason = "[1] 支持，[2] 说法不同"
    report.sections[0].table = DataTable(caption="c", columns=["a|b"], rows=[["x|y"]])
    text = render_chat_markdown(report)
    assert "⚠️ 有争议" in text and "[2] 说法不同" in text
    assert "a\\|b" in text and "x\\|y" in text
    assert "下载 Word" not in text


def test_official_site_variants_come_first_and_respect_the_limit() -> None:
    from app.services.research.authorities import official_site_query, with_official_variants

    assert (
        official_site_query("教育部 2025届全国普通高校毕业生规模")
        == "site:moe.gov.cn 2025届全国普通高校毕业生规模"
    )
    assert official_site_query("国家统计局 2025年 青年失业率").startswith("site:stats.gov.cn ")
    assert official_site_query("智联招聘 薪资报告") is None
    queries = ["智联招聘 薪资", "教育部 毕业生规模", "人社部 就业通报"]
    merged = with_official_variants(queries, limit=4)
    assert merged[:2] == ["site:moe.gov.cn 毕业生规模", "site:mohrss.gov.cn 就业通报"]
    assert len(merged) == 4 and len(set(merged)) == 4


def test_scrub_drops_unsourced_numbers_and_leaked_writing_rules_but_keeps_sourced_text() -> None:
    from app.services.research.report_data import scrub_unsupported_sentences

    evidence = "2025届高校毕业生规模预计达1222万人，同比增加43万人。"
    text = (
        "毕业生规模达1222万人 [1]。可推算同比增长约3.6%（基于2024届1179万人的常规认知）。"
        "此处严格遵循“不得自行计算”原则，故仅陈述增量。同比增加43万人 [1]。"
    )
    clean, dropped = scrub_unsupported_sentences(text, evidence)
    assert dropped == 2
    assert "1222万人" in clean and "43万人" in clean
    assert "3.6" not in clean and "原则" not in clean


def test_data_point_whose_name_says_one_year_but_period_another_is_rejected() -> None:
    bad = _point("88.6", "2024届高职毕业生去向落实率为88.6%", period="2024届")
    bad = bad.model_copy(update={"indicator": "2025届初次毕业去向落实率"})
    source = SOURCE.model_copy(update={"content": "2024届高职毕业生去向落实率为88.6%。"})
    kept, rejected = verify_data_points([bad], {1: source})
    assert kept == [] and rejected == 1
    ok = bad.model_copy(update={"indicator": "初次毕业去向落实率"})
    assert verify_data_points([ok], {1: source})[0] == [ok]


def test_relevant_sources_prefer_credible_pages_and_cap_passages_per_page() -> None:
    from app.services.research.report_builder import _relevant_sources
    from app.services.research.report_models import OutlineSection

    planned = OutlineSection(heading="毕业生规模", goal="毕业生规模", indicators=[])

    def src(i: int, url: str, tier: str, text: str) -> WebSource:
        return SOURCE.model_copy(update={"index": i, "url": url, "tier": tier, "content": text})

    mirror = [
        src(i, "https://renrendoc.com/x", "general", "毕业生规模毕业生规模毕业生规模")
        for i in range(1, 6)
    ]
    official = src(9, "https://www.moe.gov.cn/a", "authoritative", "毕业生规模1222万人")
    chosen = _relevant_sources([*mirror, official], planned, limit=3)
    assert official in chosen
    assert sum(s.url == "https://renrendoc.com/x" for s in chosen) <= 2


# ---- synthesis: judgment and advice -------------------------------------------------------------


def test_split_synthesis_parses_audience_insights_and_advice_lines() -> None:
    from app.services.research.report_llm import _split_synthesis

    audience, insights, recs = _split_synthesis(
        "【读者】应届毕业生\n【综合研判】\n- 规模扩大 [1]（把握：高）\n"
        "【行动建议】\n1. [高] 建议尽早投递 || 依据：规模预计达1222万人 [1] || 前提与风险：数据为预计值\n"
        "2. [低] 建议关注政策"
    )
    assert audience == "应届毕业生"
    assert insights.startswith("- 规模扩大")
    assert [(r.priority, r.action) for r in recs] == [
        ("高", "建议尽早投递"),
        ("低", "建议关注政策"),
    ]
    assert recs[0].reason == "规模预计达1222万人 [1]" and recs[0].caveat == "数据为预计值"


def _synth_report() -> ResearchReport:
    from app.services.research.report_models import Recommendation

    return _report().model_copy(
        update={
            "audience": "应届毕业生",
            "insights": "- 规模扩大，竞争加剧 [1]（把握：中）",
            "recommendations": [
                Recommendation(
                    action="建议尽早投递简历",
                    reason="规模预计达1222万人 [1]",
                    priority="高",
                    caveat="数据为预计值",
                    basis="strong",
                )
            ],
        }
    )


def test_render_docx_and_chat_markdown_include_judgment_and_advice() -> None:
    from app.services.research.report_markdown import render_chat_markdown

    doc = DocxDocument(io.BytesIO(render_docx(_synth_report())))
    text = "\n".join(p.text for p in doc.paragraphs)
    assert "三、综合研判" in text and "四、行动建议" in text and "五、争议与不确定" in text
    assert "建议尽早投递简历" in text
    markdown = render_chat_markdown(_synth_report())
    assert "## 综合研判" in markdown and "## 行动建议" in markdown
    assert "依据充分" in markdown and "前提与风险：数据为预计值" in markdown


@pytest.mark.anyio
async def test_synthesis_grades_premises_and_drops_advice_with_unsourced_numbers() -> None:
    from app.services.research.report_models import Recommendation

    outline = ReportOutline(
        title="t",
        sections=[OutlineSection(heading="规模", goal="多少", queries=["q"], indicators=[])],
    )

    async def fake_extract(section, evidence, *, already_used=None):
        return [_point("1222", "毕业生规模预计达1222万人")]

    async def fake_write(topic, section, evidence, data):
        return "2025届毕业生规模预计达1222万人 [1]。", "规模扩大（推测）[1]。"

    async def fake_claims(question, text, evidence, **kw):
        return [ExtractedClaim(claim="2025届毕业生规模预计达1222万人", supporting=[1])]

    drafts = [
        Recommendation(
            action="建议尽早投递", reason="2025届毕业生规模预计达1222万人 [1]", priority="高"
        ),
        Recommendation(action="建议把目标薪资定在9999元", reason="规模预计达1222万人 [1]"),
        Recommendation(action="建议关注招聘会", reason="", priority="低"),
    ]
    with (
        patch.object(report_builder, "plan_outline", AsyncMock(return_value=outline)),
        patch.object(report_builder, "extract_data_points", fake_extract),
        patch.object(report_builder, "write_section", fake_write),
        patch.object(report_builder, "write_summary", AsyncMock(return_value="")),
        patch.object(
            report_builder,
            "write_synthesis",
            AsyncMock(return_value=("毕业生", "- 判断 [1]", drafts)),
        ),
        patch.object(report_builder, "extract_claims", fake_claims),
    ):
        report = await report_builder.ReportBuilder(FakeResearch(FakeRetrieval())).build(
            "大学生就业数据", AsyncMock()
        )

    assert [r.action for r in report.recommendations] == ["建议尽早投递", "建议关注招聘会"]
    assert report.recommendations[0].basis == "strong"
    assert report.recommendations[1].basis == "inference"
    assert report.audience == "毕业生"


@pytest.mark.anyio
async def test_summary_writer_is_told_which_claims_are_disputed_or_single_source() -> None:
    from types import SimpleNamespace

    from app.services.research.audit import AuditedClaim
    from app.services.research.report_models import ReportSection

    def claim(text: str, level: str) -> AuditedClaim:
        return AuditedClaim(
            claim=text, level=level, supported=level != "unverified",  # type: ignore[arg-type]
            citation_indices=[1], contradicting=[], domains=[], reason="r",
        )  # fmt: skip

    section = ReportSection(
        heading="h", body="正文 [1]", analysis="", claims=[
            claim("渗透率为47.9%", "disputed"), claim("销量1649万辆", "verified"), claim("出口261万辆", "single_source"),
        ],
    )  # fmt: skip
    writer = AsyncMock(return_value="- x")
    builder = report_builder.ReportBuilder(SimpleNamespace())  # type: ignore[arg-type]
    corpus = SimpleNamespace(sources=[])
    with patch.object(report_builder, "write_summary", writer):
        await builder.summary("t", [section], corpus)  # type: ignore[arg-type]
    weak = writer.await_args.kwargs["weak"]
    assert len(weak) == 2
    assert any("47.9%" in w and "有争议" in w for w in weak)
    assert not any("1649" in w for w in weak)


@pytest.mark.anyio
async def test_corroboration_regrades_sections_concurrently() -> None:
    import asyncio
    from types import SimpleNamespace

    from app.services.research.audit import AuditedClaim
    from app.services.research.report_models import OutlineSection, ReportSection

    def weak(text: str) -> AuditedClaim:
        return AuditedClaim(
            claim=text, level="single_source", supported=True, citation_indices=[1],
            contradicting=[], domains=[], reason="r",
        )  # fmt: skip

    sections = [ReportSection(heading=f"h{i}", body="正文 [1]", claims=[weak(f"说法{i} 12%")]) for i in range(4)]
    planned = [OutlineSection(heading=f"h{i}", goal="g", indicators=[], queries=[]) for i in range(4)]
    running = peak = 0

    async def slow_grade(*args: Any, **kwargs: Any) -> list[AuditedClaim]:
        nonlocal running, peak
        running += 1
        peak = max(peak, running)
        await asyncio.sleep(0.02)
        running -= 1
        return [weak("x")]

    corpus = SimpleNamespace(sources=[], retrieve=AsyncMock(return_value=[]))
    research = SimpleNamespace(gather=AsyncMock())
    builder = report_builder.ReportBuilder(research)  # type: ignore[arg-type]
    with patch.object(builder, "grade", slow_grade):
        await builder.corroborate(planned, sections, corpus, SimpleNamespace())  # type: ignore[arg-type]
    assert peak >= 3
