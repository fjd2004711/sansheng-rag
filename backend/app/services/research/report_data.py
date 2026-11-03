"""Deterministic checks and assembly for report data — no model involved.

A data point is kept only if its quote occurs verbatim in the cited source and the value occurs in the quote,
so every number in a report table can be found word for word in the original page.
"""

from __future__ import annotations

import re
import unicodedata

from app.services.research.models import WebSource
from app.services.research.report_models import ChartSeries, DataPoint, DataTable

_NUMBER = re.compile(r"\d+(?:\.\d+)?")
_MIN_CHART_POINTS = 3
_YEAR = re.compile(r"(19|20)\d{2}")


def normalize(text: str) -> str:
    """Width-insensitive, whitespace-free, comma-free text for verbatim comparison."""
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"[*_`\\]", "", text)  # Markdown emphasis from page extraction
    return re.sub(r"[\s,，]", "", text)


def verify_data_points(
    points: list[DataPoint], sources: dict[int, WebSource]
) -> tuple[list[DataPoint], int]:
    """(kept, rejected): kept points quote their source verbatim and the quote contains the value."""
    kept: list[DataPoint] = []
    seen: set[tuple[str, str, str, int]] = set()
    rejected = 0
    for point in points:
        source = sources.get(point.source)
        quote = normalize(point.quote)
        value = normalize(point.value)
        if (
            source is None
            or not quote
            or not value
            or quote not in normalize(source.content)
            or value not in quote
        ):
            rejected += 1
            continue
        if _years_conflict(point.indicator, point.period):
            rejected += 1
            continue
        key = (point.indicator, point.period, point.value, point.source)
        if key not in seen:
            seen.add(key)
            kept.append(point)
    return kept, rejected


def display_value(point: DataPoint) -> str:
    """Value with its unit, without doubling a unit the source text already carried ("1270万人" + "万人")."""
    value = point.value.strip()
    return value if not point.unit or value.endswith(point.unit) else f"{value}{point.unit}"


def data_table(heading: str, points: list[DataPoint]) -> DataTable | None:
    """One row per indicator/period/scope/value; the same figure from several sources lists them all."""
    if not points:
        return None
    merged: dict[tuple[str, str, str, str], list[int]] = {}
    for p in sorted(points, key=lambda p: (p.indicator, _period_key(p.period), p.scope)):
        merged.setdefault((p.indicator, display_value(p), p.period, p.scope), []).append(p.source)
    rows = [
        [
            indicator,
            value,
            period or "—",
            scope or "—",
            "".join(f"[{n}]" for n in dict.fromkeys(sources)),
        ]
        for (indicator, value, period, scope), sources in merged.items()
    ]
    return DataTable(
        caption=f"{heading}：关键数据", columns=["指标", "数值", "时间", "范围", "来源"], rows=rows
    )


def _as_float(value: str) -> float | None:
    match = _NUMBER.search(normalize(value))
    return float(match.group(0)) if match else None


def trend_chart(points: list[DataPoint]) -> ChartSeries | None:
    """The longest same-indicator, same-unit series over distinct periods (≥3), if any."""
    groups: dict[tuple[str, str, str], dict[str, DataPoint]] = {}
    for point in points:
        if point.period and _as_float(point.value) is not None:
            group = groups.setdefault((point.indicator, point.unit, point.scope), {})
            group.setdefault(point.period, point)  # first source wins for a period
    best = max(groups.items(), key=lambda item: len(item[1]), default=None)
    if best is None or len(best[1]) < _MIN_CHART_POINTS:
        return None
    (indicator, unit, scope), by_period = best
    ordered = sorted(by_period.items(), key=lambda item: _period_key(item[0]))
    return ChartSeries(
        title=f"{indicator}{'（' + scope + '）' if scope else ''}",
        unit=unit,
        labels=[period for period, _ in ordered],
        values=[_as_float(p.value) or 0.0 for _, p in ordered],
        sources=sorted({p.source for _, p in ordered}),
    )


def comparison_chart(points: list[DataPoint]) -> ChartSeries | None:
    """Several indicators of one unit, one period and one scope side by side (≥3), when no trend series exists."""
    groups: dict[tuple[str, str, str], dict[str, DataPoint]] = {}
    for point in points:
        if point.period and point.indicator.strip() and _as_float(point.value) is not None:
            group = groups.setdefault((point.unit, point.period, point.scope), {})
            group.setdefault(point.indicator.strip(), point)  # the same indicator twice is one bar
    best = max(groups.items(), key=lambda item: len(item[1]), default=None)
    if best is None or len(best[1]) < _MIN_CHART_POINTS:
        return None
    (unit, period, scope), by_indicator = best
    values = [_as_float(p.value) or 0.0 for p in by_indicator.values()]
    # Percentages that add up to a whole are shares: a pie says that better than bars do.
    is_share = unit.strip() in ("%", "％") and 90.0 <= sum(values) <= 100.5 and min(values) >= 0
    return ChartSeries(
        kind="pie" if is_share else "bar",
        title=f"{period}{scope}指标对比" if scope else f"{period}指标对比",
        unit=unit,
        labels=list(by_indicator),
        values=values,
        sources=sorted({p.source for p in by_indicator.values()}),
    )


_YEAR_TOKEN = re.compile(r"(?:19|20)\d{2}")
# Sentences that leak the writer's own instructions or knowledge from outside the sources.
_META = re.compile(
    r"严格遵循|不得自行|原则[，,）)]|常规认知|按照要求|根据要求|提示词|此处不|本模型|作为(?:一个)?AI"
)


def _years_conflict(indicator: str, period: str) -> bool:
    """An indicator named for one year but dated another ("2025届…落实率", period "2024届") is mislabelled."""
    in_name, in_period = set(_YEAR_TOKEN.findall(indicator)), set(_YEAR_TOKEN.findall(period))
    return bool(in_name and in_period and not in_name <= in_period)


def scrub_unsupported_sentences(text: str, evidence: str) -> tuple[str, int]:
    """Drop sentences that carry a number found in no source, or that leak the writer's instructions.

    A reader should never see a figure the pages do not contain, nor "按原则不自行计算" in the report body.
    """
    kept: list[str] = []
    dropped = 0
    for paragraph in text.split("\n"):
        parts = re.split(r"(?<=[。；！？，])", paragraph)
        good = []
        for sentence in parts:
            if sentence.strip() and (
                _META.search(sentence) or unsupported_numbers(sentence, evidence)
            ):
                dropped += 1
            else:
                good.append(sentence)
        joined = "".join(good)
        # A dropped clause can leave "…[1]，" dangling; close it with the sentence end it replaced.
        kept.append(re.sub(r"[，、]+$", "。", joined) if joined != paragraph else joined)
    return re.sub(r"\n{3,}", "\n\n", "\n".join(kept)).strip(), dropped


def _period_key(period: str) -> tuple[int, str]:
    year = re.search(r"(19|20)\d{2}", period)
    return (int(year.group(0)) if year else 9999, period)


def unsupported_numbers(text: str, evidence: str) -> list[str]:
    """Numbers in the written text that occur nowhere in the evidence (citation markers ignored)."""
    plain = re.sub(r"\[\d+\]", "", text)
    haystack = normalize(evidence)
    missing = []
    for number in dict.fromkeys(_NUMBER.findall(normalize(plain))):
        if _YEAR.fullmatch(
            number
        ):  # years frame the text ("2021—2025届"); data values are what must be sourced
            continue
        if len(number) >= 2 and number not in haystack:
            missing.append(number)
    return missing
