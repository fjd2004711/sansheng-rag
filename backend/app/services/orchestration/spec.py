"""Declarative definitions: knowledge bases, agents, teams, workflows and run policies.

Everything the platform runs is described here and validated before it starts, so a malformed definition fails with
a readable message instead of half-way through a ten-minute run.
"""

from __future__ import annotations

from typing import Any, Literal

import yaml
from pydantic import BaseModel, Field, ValidationError, model_validator

from app.services.orchestration.exceptions import SpecError

NodeKind = Literal["agent", "map", "gate", "loop", "merge"]
ModelTier = Literal["fast", "strong"]


class KnowledgeBaseSpec(BaseModel):
    kind: Literal["KnowledgeBase"] = "KnowledgeBase"
    name: str
    description: str = ""
    sources: list[dict[str, Any]] = Field(default_factory=list)
    prefer_sites: list[str] = Field(default_factory=list)
    retrieval: dict[str, Any] = Field(default_factory=dict)
    freshness_days: int = 365


class AgentSpec(BaseModel):
    kind: Literal["Agent"] = "Agent"
    name: str
    role: str
    skill: str  # key in the skill registry: what this agent actually does
    model_tier: ModelTier = "strong"
    tools: list[str] = Field(default_factory=list)
    knowledge: list[str] = Field(default_factory=list)
    # What the agent may read. "draft" = the text under review; a verifier must never see the writer's reasoning.
    can_see: list[str] = Field(default_factory=list)
    independent: bool = False  # a verifier runs apart from the executor it checks
    max_tokens: int | None = None


class TeamSpec(BaseModel):
    kind: Literal["Team"] = "Team"
    name: str
    description: str = ""
    members: list[str]
    supervisor: str | None = None


class GateSpec(BaseModel):
    """A quality gate: metrics computed by the verifier are compared with thresholds."""

    min_verified_ratio: float | None = Field(default=None, ge=0, le=1)
    max_unsupported_numbers: int | None = Field(default=None, ge=0)
    require_scope_disclosed: bool = False
    min_authoritative_sections: float | None = Field(default=None, ge=0, le=1)


class NodeSpec(BaseModel):
    id: str
    kind: NodeKind = "agent"
    agent: str | None = None
    depends_on: list[str] = Field(default_factory=list)
    map_over: str | None = (
        None  # name of a collection the upstream node produces; the node fans out over it
    )
    pool: Literal["none", "search", "llm"] = "llm"
    priority: int = 5  # lower runs first among ready nodes
    essential: bool = True  # non-essential work is dropped first when the budget runs out
    retries: int = Field(default=1, ge=0, le=3)
    timeout_seconds: int = Field(default=900, ge=5, le=3600)
    gate: GateSpec | None = None
    on_fail: str | None = None  # id of the loop node that repairs a failed gate
    max_rounds: int = Field(default=1, ge=1, le=3)


class PolicySpec(BaseModel):
    max_tokens: int = Field(default=600_000, ge=1000)
    max_seconds: int = Field(default=2400, ge=30)
    max_repair_rounds: int = Field(default=2, ge=0, le=4)
    search_concurrency: int = Field(default=2, ge=1, le=8)
    llm_concurrency: int = Field(default=4, ge=1, le=16)
    fallback_models: list[str] = Field(
        default_factory=list
    )  # tried in order when the primary model fails
    fast_model: str | None = (
        None  # cheap model for light tasks (search planning, assembly); None = primary
    )


class WorkflowSpec(BaseModel):
    kind: Literal["Workflow"] = "Workflow"
    name: str
    description: str = ""
    team: str
    nodes: list[NodeSpec]
    policy: PolicySpec = Field(default_factory=PolicySpec)

    @model_validator(mode="after")
    def _check_graph(self) -> WorkflowSpec:
        ids = [n.id for n in self.nodes]
        if len(ids) != len(set(ids)):
            raise ValueError("节点 id 重复")
        known = set(ids)
        for node in self.nodes:
            for dep in node.depends_on:
                if dep not in known:
                    raise ValueError(f"节点 {node.id} 依赖不存在的节点 {dep}")
            if node.kind == "gate" and node.gate is None:
                raise ValueError(f"质量门节点 {node.id} 没有写 gate 阈值")
            if node.on_fail and node.on_fail not in known:
                raise ValueError(f"节点 {node.id} 的 on_fail 指向不存在的节点 {node.on_fail}")
            if node.kind != "gate" and node.on_fail:
                raise ValueError(f"只有质量门节点可以写 on_fail（{node.id}）")
        _assert_acyclic(self.nodes)
        return self


def _assert_acyclic(nodes: list[NodeSpec]) -> None:
    deps = {n.id: set(n.depends_on) for n in nodes}
    done: set[str] = set()
    while len(done) < len(deps):
        ready = [i for i, d in deps.items() if i not in done and d <= done]
        if not ready:
            cycle = sorted(set(deps) - done)
            raise ValueError(f"工作流存在循环依赖：{'、'.join(cycle)}")
        done.update(ready)


class Bundle(BaseModel):
    """Everything a run needs: one workflow plus the team, agents and knowledge bases it references."""

    workflow: WorkflowSpec
    team: TeamSpec
    agents: dict[str, AgentSpec]
    knowledge: dict[str, KnowledgeBaseSpec] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _check_refs(self) -> Bundle:
        if self.workflow.team != self.team.name:
            raise ValueError(
                f"工作流指定的团队 {self.workflow.team} 与提供的团队 {self.team.name} 不一致"
            )
        for member in self.team.members:
            if member not in self.agents:
                raise ValueError(f"团队成员 {member} 没有对应的 Agent 定义")
        if self.team.supervisor and self.team.supervisor not in self.team.members:
            raise ValueError("supervisor 必须是团队成员")
        for node in self.workflow.nodes:
            if node.kind in ("agent", "map", "loop", "merge") and node.agent:
                if node.agent not in self.team.members:
                    raise ValueError(f"节点 {node.id} 使用的 Agent {node.agent} 不在团队里")
            elif node.kind in ("agent", "map", "loop") and not node.agent:
                raise ValueError(f"节点 {node.id} 没有指定 agent")
        for agent in self.agents.values():
            for kb in agent.knowledge:
                if kb not in self.knowledge:
                    raise ValueError(f"Agent {agent.name} 引用了不存在的知识库 {kb}")
        # Independence is enforced, not just declared: a node that checks another agent's output must be run by
        # an agent that is marked independent and cannot see the executor's reasoning.
        for node in self.workflow.nodes:
            if node.kind == "gate":
                continue
            agent = self.agents.get(node.agent or "")
            if agent and agent.independent and "reasoning" in agent.can_see:
                raise ValueError(f"独立核查员 {agent.name} 不能读取执行者的推理过程")
        return self

    def node(self, node_id: str) -> NodeSpec:
        return next(n for n in self.workflow.nodes if n.id == node_id)


def parse_bundle(text: str) -> Bundle:
    """A YAML document set (``---`` separated) into a validated bundle."""
    try:
        docs = [d for d in yaml.safe_load_all(text) if d]
    except yaml.YAMLError as exc:
        raise SpecError(message=f"YAML 解析失败：{exc}") from exc
    workflows: list[WorkflowSpec] = []
    teams: list[TeamSpec] = []
    agents: dict[str, AgentSpec] = {}
    knowledge: dict[str, KnowledgeBaseSpec] = {}
    try:
        for doc in docs:
            kind = doc.get("kind") if isinstance(doc, dict) else None
            if kind == "Workflow":
                workflows.append(WorkflowSpec.model_validate(doc))
            elif kind == "Team":
                teams.append(TeamSpec.model_validate(doc))
            elif kind == "Agent":
                agent = AgentSpec.model_validate(doc)
                agents[agent.name] = agent
            elif kind == "KnowledgeBase":
                kb = KnowledgeBaseSpec.model_validate(doc)
                knowledge[kb.name] = kb
            else:
                raise SpecError(
                    message=f"未知的定义类型：{kind!r}（应为 KnowledgeBase / Agent / Team / Workflow）"
                )
        if len(workflows) != 1 or len(teams) != 1:
            raise SpecError(message="一份定义需要恰好一个 Workflow 和一个 Team")
        return Bundle(workflow=workflows[0], team=teams[0], agents=agents, knowledge=knowledge)
    except ValidationError as exc:
        raise SpecError(message=_readable(exc)) from exc


def _readable(exc: ValidationError) -> str:
    parts = []
    for err in exc.errors():
        where = ".".join(str(p) for p in err["loc"] if p != "__root__")
        parts.append(f"{where}：{err['msg']}" if where else err["msg"])
    return "；".join(parts)[:600]
