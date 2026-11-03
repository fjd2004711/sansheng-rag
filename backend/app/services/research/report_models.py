"""The research report as stored (JSON) and rendered to Word / PDF."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.services.research.audit import AuditedClaim
from app.services.research.models import WebSource


class OutlineSection(BaseModel):
    heading: str
    goal: str
    queries: list[str] = Field(default_factory=list)
    indicators: list[str] = Field(default_factory=list)


class ReportOutline(BaseModel):
    title: str
    sections: list[OutlineSection]


class DataPoint(BaseModel):
    """One number with the exact sentence of the source that states it."""

    indicator: str
    value: str
    unit: str = ""
    period: str = ""
    scope: str = ""
    source: int
    quote: str


class DataTable(BaseModel):
    caption: str
    columns: list[str]
    rows: list[list[str]]


class ChartSeries(BaseModel):
    # "line": one indicator over periods; "bar": several indicators, one unit, one period, side by side;
    # "pie": the same, when they are percentages that make up a whole.
    kind: Literal["line", "bar", "pie"] = "line"
    title: str
    unit: str
    labels: list[str]
    values: list[float]
    sources: list[int]


class DiagramNode(BaseModel):
    id: str
    label: str
    tone: Literal["plain", "good", "warn", "bad"] = "plain"


class DiagramEvent(BaseModel):
    period: str
    label: str


class Diagram(BaseModel):
    """A figure drawn from the report itself (its structure and its verified data), never from outside facts."""

    kind: Literal["framework", "timeline"]
    title: str
    caption: str = ""
    nodes: list[DiagramNode] = Field(default_factory=list)
    edges: list[list[str]] = Field(default_factory=list)
    events: list[DiagramEvent] = Field(default_factory=list)


class ReportSection(BaseModel):
    heading: str
    body: str
    analysis: str = ""
    data_points: list[DataPoint] = Field(default_factory=list)
    table: DataTable | None = None
    chart: ChartSeries | None = None
    claims: list[AuditedClaim] = Field(default_factory=list)


class Recommendation(BaseModel):
    """One piece of advice: a judgment drawn from the evidence, not a fact the sources state."""

    action: str
    reason: str
    priority: Literal["高", "中", "低"] = "中"
    caveat: str = ""
    # How well the factual premises in ``reason`` hold up: strong = all verified, mixed = some rest on one source,
    # weak = some premise is unverified or disputed, inference = it states no checkable fact.
    basis: Literal["strong", "mixed", "weak", "inference"] = "inference"
    premises: list[AuditedClaim] = Field(default_factory=list)


class ReportMethod(BaseModel):
    queries: list[str]
    pages_read: int
    full_text_pages: int
    sources_by_tier: dict[str, int]
    data_points_kept: int
    data_points_rejected: int
    model: str
    started_at: str
    finished_at: str


class ResearchReport(BaseModel):
    title: str
    topic: str
    generated_at: str
    summary: str
    summary_claims: list[AuditedClaim] = Field(default_factory=list)
    sections: list[ReportSection]
    audience: str = ""
    insights: str = ""
    insight_claims: list[AuditedClaim] = Field(default_factory=list)
    recommendations: list[Recommendation] = Field(default_factory=list)
    caveats: list[str] = Field(default_factory=list)
    diagrams: list[Diagram] = Field(default_factory=list)
    method: ReportMethod
    sources: list[WebSource]

    def all_claims(self) -> list[AuditedClaim]:
        return [
            *self.summary_claims,
            *(claim for section in self.sections for claim in section.claims),
            *self.insight_claims,
            *(claim for rec in self.recommendations for claim in rec.premises),
        ]
