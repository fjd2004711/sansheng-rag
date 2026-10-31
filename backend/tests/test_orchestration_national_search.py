"""Official, national-scope searches run while sections are drafted, so a failed gate does not search them late."""

from types import SimpleNamespace

from app.services.orchestration.builtin import builtin_bundles
from app.services.orchestration.skills import expand_items, national_queries, repair_queries
from app.services.orchestration.state import RunState


def _section(*indicators: str) -> SimpleNamespace:
    return SimpleNamespace(indicators=list(indicators), heading="h")


def test_national_queries_take_the_leading_indicators_of_every_section() -> None:
    sections = [_section("销量", "渗透率", "出口"), _section("充电桩")]
    assert national_queries("新能源汽车", sections) == [
        "新能源汽车 销量 全国 官方发布",
        "新能源汽车 渗透率 全国 官方发布",
        "新能源汽车 充电桩 全国 官方发布",
    ]


def test_national_batches_are_grouped_like_query_batches() -> None:
    state = RunState(topic="t", input={})
    state.national_queries = [f"q{i}" for i in range(9)]
    batches = expand_items(state, "national_batches")
    assert [len(b) for b in batches] == [4, 4, 1]


def test_repair_only_searches_what_the_national_pass_did_not() -> None:
    state = RunState(topic="t", input={})
    state.outline = SimpleNamespace(sections=[_section("销量", "出口"), _section("充电桩")])  # type: ignore[assignment]
    state.national_queries = ["t 销量 全国 官方发布"]
    state.queries = ["t 充电桩 全国 官方发布"]
    assert repair_queries(state, {0: [], 1: []}) == ["t 出口 全国 官方发布"]


def test_the_gate_waits_for_the_national_search_but_sections_do_not() -> None:
    nodes = {n.id: n for n in builtin_bundles()["verified-report"].workflow.nodes}
    assert nodes["search_national"].depends_on == ["search"]
    assert "search_national" not in nodes["sections"].depends_on
    assert "search_national" in nodes["gate_sections"].depends_on
    assert nodes["search_national"].essential is False
    assert nodes["search_national"].pool == "search"
