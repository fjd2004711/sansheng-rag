"""Research report schemas."""

from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from app.schemas.base import BaseSchema, TimestampSchema


class ResearchReportCreate(BaseSchema):
    topic: str = Field(
        min_length=2, max_length=200, description="调研主题，如“2025年大学生就业数据”"
    )


class ResearchReportSummary(BaseSchema, TimestampSchema):
    id: UUID
    topic: str
    title: str | None = None
    status: Literal["queued", "running", "done", "failed"]
    stage: str = ""
    progress: int = 0
    error: str | None = None


class ResearchReportRead(ResearchReportSummary):
    report: dict[str, Any] | None = None


class ResearchReportList(BaseSchema):
    items: list[ResearchReportSummary]
    total: int
