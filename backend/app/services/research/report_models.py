"""The research report as stored (JSON) and rendered to Word / PDF."""

from __future__ import annotations

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
    title: str
    unit: str
    labels: list[str]
    values: list[float]
    sources: list[int]


class ReportSection(BaseModel):
    heading: str
    body: str
    analysis: str = ""
    data_points: list[DataPoint] = Field(default_factory=list)
    table: DataTable | None = None
    chart: ChartSeries | None = None
    claims: list[AuditedClaim] = Field(default_factory=list)


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
    caveats: list[str] = Field(default_factory=list)
    method: ReportMethod
    sources: list[WebSource]

    def all_claims(self) -> list[AuditedClaim]:
        return [
            *self.summary_claims,
            *(claim for section in self.sections for claim in section.claims),
        ]
