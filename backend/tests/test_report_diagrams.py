from app.services.research.report_data import comparison_chart
from app.services.research.report_diagrams import (
    diagram_png,
    diagrams_for,
    framework_diagram,
    mermaid_of,
    timeline_diagram,
)
from app.services.research.report_models import DataPoint
from tests.test_research_report import _report


def _dp(indicator: str, value: str, period: str, unit: str = "万辆") -> DataPoint:
    return DataPoint(
        indicator=indicator,
        value=value,
        unit=unit,
        period=period,
        source=1,
        quote="q",
        scope="全国",
    )


def test_framework_diagram_links_topic_sections_and_shows_how_much_was_verified() -> None:
    report = _report()
    diagram = framework_diagram(report)
    if diagram is None:  # the shared fixture may have one section only
        report.sections = [
            report.sections[0],
            report.sections[0].model_copy(update={"heading": "第二章"}),
        ]
        diagram = framework_diagram(report)
    assert diagram is not None
    ids = {n.id for n in diagram.nodes}
    assert "T" in ids and "S1" in ids and "S2" in ids
    assert all(a in ids and b in ids for a, b in diagram.edges)


def test_mermaid_of_framework_is_a_flowchart_without_label_breaking_characters() -> None:
    report = _report()
    report.sections = [
        report.sections[0],
        report.sections[0].model_copy(update={"heading": '含"引号"[括号]:冒号'}),
    ]
    text = mermaid_of(framework_diagram(report))  # type: ignore[arg-type]
    assert text.startswith("flowchart LR")
    label_lines = [line for line in text.splitlines() if '["' in line]
    assert label_lines and all(line.count('"') == 2 for line in label_lines)


def test_timeline_needs_three_distinct_dates_and_is_in_time_order() -> None:
    report = _report()
    report.sections[0].data_points = [
        _dp("销量", "100", "2025年3月"),
        _dp("销量", "90", "2024年12月"),
        _dp("产量", "80", "2023年"),
    ]
    diagram = timeline_diagram(report)
    assert diagram is not None
    assert [e.period for e in diagram.events] == ["2023年", "2024年12月", "2025年3月"]
    assert mermaid_of(diagram).startswith("timeline")
    report.sections[0].data_points = report.sections[0].data_points[:2]
    assert timeline_diagram(report) is None


def test_percentages_that_make_a_whole_become_a_pie() -> None:
    pts = [
        _dp("国有企业", "40", "2025年", "%"),
        _dp("民营企业", "35", "2025年", "%"),
        _dp("外资", "25", "2025年", "%"),
    ]
    assert comparison_chart(pts).kind == "pie"  # type: ignore[union-attr]
    partial = [
        _dp("a", "10", "2025年", "%"),
        _dp("b", "20", "2025年", "%"),
        _dp("c", "30", "2025年", "%"),
    ]
    assert comparison_chart(partial).kind == "bar"  # type: ignore[union-attr]


def test_diagram_and_pie_pngs_render() -> None:
    from app.services.research.report_chart import chart_png
    from app.services.research.report_models import ChartSeries

    report = _report()
    report.sections = [
        report.sections[0],
        report.sections[0].model_copy(update={"heading": "第二章"}),
    ]
    report.sections[0].data_points = [
        _dp("a", "1", "2022年"),
        _dp("b", "2", "2023年"),
        _dp("c", "3", "2024年"),
    ]
    for diagram in diagrams_for(report):
        assert diagram_png(diagram).startswith(b"\x89PNG")
    pie = ChartSeries(
        kind="pie", title="结构", unit="%", labels=["a", "b"], values=[60, 40], sources=[1]
    )
    assert chart_png(pie).startswith(b"\x89PNG")
