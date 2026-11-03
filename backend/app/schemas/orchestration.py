"""Orchestration platform schemas."""

from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from app.schemas.base import BaseSchema, TimestampSchema


class GraphNode(BaseSchema):
    id: str
    kind: str
    agent: str | None = None
    role: str = ""
    skill: str = ""
    pool: str = "none"
    essential: bool = True
    independent: bool = False
    on_fail: str | None = None
    gate: dict[str, Any] | None = None
    max_rounds: int = 1


class GraphEdge(BaseSchema):
    source: str
    target: str
    kind: Literal["depends", "repair"] = "depends"


class SpecGraph(BaseSchema):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    policy: dict[str, Any]
    team: dict[str, Any]
    agents: list[dict[str, Any]]


class SpecRead(BaseSchema):
    name: str
    description: str = ""
    builtin: bool
    yaml: str
    graph: SpecGraph
    input: Literal["topic", "text"] = "topic"


class SpecList(BaseSchema):
    items: list[SpecRead]


class SpecValidate(BaseSchema):
    yaml: str = Field(min_length=10, max_length=60_000)


class SpecValidation(BaseSchema):
    ok: bool
    error: str | None = None
    name: str | None = None
    graph: SpecGraph | None = None


class RunCreate(BaseSchema):
    spec: str = Field(min_length=1, max_length=120, description="定义名称")
    topic: str = Field(min_length=2, max_length=2000, description="调研主题，或要核查的文字")
    model: str | None = Field(
        default=None, max_length=120, pattern=r"^[\w.\-:/]+$", description="本次运行统一使用的模型"
    )
    agent_models: dict[str, str] = Field(
        default_factory=dict, description="按 agent 名称单独指定的模型"
    )


class RunSummary(BaseSchema, TimestampSchema):
    id: UUID
    spec_name: str
    topic: str
    status: Literal["queued", "running", "done", "failed"]
    stage: str = ""
    progress: int = 0
    error: str | None = None
    metrics: dict[str, Any] | None = None


class RunEvent(BaseSchema):
    seq: int
    t: float
    kind: str
    detail: dict[str, Any]


class RunDetail(RunSummary):
    result: dict[str, Any] | None = None
    graph: SpecGraph | None = None
    events: list[RunEvent] = Field(default_factory=list)


class RunList(BaseSchema):
    items: list[RunSummary]
    total: int


class FeedbackCreate(BaseSchema):
    rating: Literal[1, -1]
    tags: list[str] = Field(default_factory=list, max_length=8)
    comment: str | None = Field(default=None, max_length=1000)


class Insights(BaseSchema):
    runs: int
    averages: dict[str, float]
    failure_types: dict[str, int]
    repair_success_rate: float | None = None
    verified_gain: float | None = None
    ratings: dict[str, int]
    tags: dict[str, int]
    hints: list[dict[str, str]]
