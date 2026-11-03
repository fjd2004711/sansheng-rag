"""Public face of the orchestration platform: specs, runs, feedback and insights. Routes only use this."""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import BadRequestError, NotFoundError, RateLimitError
from app.db.models.orchestration import OrchRun
from app.repositories import orchestration as repo
from app.schemas.orchestration import (
    FeedbackCreate,
    GraphEdge,
    GraphNode,
    Insights,
    RunCreate,
    RunDetail,
    RunEvent,
    SpecGraph,
    SpecRead,
    SpecValidation,
)
from app.services.orchestration import registry
from app.services.orchestration.builtin import BUILTIN_YAML, builtin_bundles
from app.services.orchestration.exceptions import SpecError
from app.services.orchestration.insights import build_insights
from app.services.orchestration.spec import Bundle, parse_bundle
from app.services.research import ReportDocument, render_docx, render_pdf

STALE_MESSAGE = "运行中断（服务重启或超时），请重新运行"
_TEXT_INPUT = {"fact-check"}
_MEDIA_TYPES = {
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pdf": "application/pdf",
}


def graph_of(bundle: Bundle) -> SpecGraph:
    wf = bundle.workflow
    nodes = []
    for n in wf.nodes:
        agent = bundle.agents.get(n.agent or "")
        nodes.append(
            GraphNode(
                id=n.id, kind=n.kind, agent=n.agent, role=agent.role if agent else "", skill=agent.skill if agent else "",
                pool=n.pool, essential=n.essential, independent=bool(agent and agent.independent), on_fail=n.on_fail,
                gate=n.gate.model_dump(exclude_none=True) if n.gate else None, max_rounds=n.max_rounds,
            )
        )  # fmt: skip
    edges = [GraphEdge(source=d, target=n.id) for n in wf.nodes for d in n.depends_on]
    edges += [
        GraphEdge(source=n.id, target=n.on_fail, kind="repair") for n in wf.nodes if n.on_fail
    ]
    return SpecGraph(
        nodes=nodes,
        edges=edges,
        policy=wf.policy.model_dump(),
        team=bundle.team.model_dump(),
        agents=[a.model_dump() for a in bundle.agents.values()],
    )


class OrchestrationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ---- specs -------------------------------------------------------------------------------------

    async def list_specs(self, user_id: UUID) -> list[SpecRead]:
        items = [self._read(name, text, builtin=True) for name, text in BUILTIN_YAML.items()]
        for spec in await repo.list_specs(self.db, user_id=user_id):
            items.append(self._read(spec.name, spec.yaml, builtin=False))
        return items

    def validate(self, text: str) -> SpecValidation:
        try:
            bundle = parse_bundle(text)
        except SpecError as exc:
            return SpecValidation(ok=False, error=exc.message)
        return SpecValidation(ok=True, name=bundle.workflow.name, graph=graph_of(bundle))

    async def save_spec(self, user_id: UUID, text: str) -> SpecRead:
        bundle = parse_bundle(text)  # raises SpecError (400) with a readable message
        name = bundle.workflow.name
        if name in BUILTIN_YAML:
            raise BadRequestError(message="不能覆盖内置定义，请换一个工作流名称")
        if not re.fullmatch(r"[\w\-一-鿿]{2,60}", name):
            raise BadRequestError(
                message="工作流名称只能用字母、数字、中文、下划线和短横线（2–60 个字符）"
            )
        spec = await repo.save_spec(self.db, user_id=user_id, name=name, yaml_text=text)
        return self._read(spec.name, spec.yaml, builtin=False)

    async def delete_spec(self, user_id: UUID, name: str) -> None:
        if name in BUILTIN_YAML or not await repo.delete_spec(self.db, user_id=user_id, name=name):
            raise NotFoundError(message="定义不存在或是内置定义", details={"name": name})

    async def resolve_bundle(self, user_id: UUID, name: str) -> Bundle:
        if name in BUILTIN_YAML:
            return builtin_bundles()[name]
        spec = await repo.get_spec(self.db, user_id=user_id, name=name)
        if spec is None:
            raise NotFoundError(message="工作流定义不存在", details={"name": name})
        return parse_bundle(spec.yaml)

    @staticmethod
    def _read(name: str, text: str, *, builtin: bool) -> SpecRead:
        bundle = parse_bundle(text)
        return SpecRead(
            name=name, description=bundle.workflow.description, builtin=builtin, yaml=text,
            graph=graph_of(bundle), input="text" if name in _TEXT_INPUT else "topic",
        )  # fmt: skip

    # ---- runs --------------------------------------------------------------------------------------

    async def create_run(self, user_id: UUID, data: RunCreate) -> OrchRun:
        bundle = await self.resolve_bundle(user_id, data.spec)
        if await repo.count_active(self.db, user_id=user_id) > 0:
            await self._expire_stale(user_id)
            if await repo.count_active(self.db, user_id=user_id) > 0:
                raise RateLimitError(message="已有一个运行正在进行，请等它完成后再开始新的运行")
        since = datetime.now(UTC) - timedelta(days=1)
        if (
            await repo.count_since(self.db, user_id=user_id, since=since)
            >= settings.REPORT_MAX_PER_DAY
        ):
            raise RateLimitError(
                message=f"每天最多运行 {settings.REPORT_MAX_PER_DAY} 次，请明天再试"
            )
        run_input = {"text": data.topic} if data.spec in _TEXT_INPUT else {}
        return await repo.create_run(
            self.db, user_id=user_id, spec_name=data.spec, topic=data.topic[:2000],
            run_input=run_input, bundle=bundle.model_dump(mode="json"),
        )  # fmt: skip

    async def list_runs(self, user_id: UUID, *, skip: int, limit: int) -> tuple[list[OrchRun], int]:
        await self._expire_stale(user_id)
        return await repo.list_runs(self.db, user_id=user_id, skip=skip, limit=limit)

    async def get_run(self, user_id: UUID, run_id: UUID) -> OrchRun:
        run = await repo.get_run(self.db, run_id)
        if run is None or run.user_id != user_id:
            raise NotFoundError(message="运行不存在", details={"run_id": str(run_id)})
        if _is_stale(run):
            run = await repo.update_run(
                self.db, db_run=run, update_data={"status": "failed", "error": STALE_MESSAGE}
            )
        return run

    async def run_detail(self, user_id: UUID, run_id: UUID) -> RunDetail:
        run = await self.get_run(user_id, run_id)
        events = await repo.list_events(self.db, run_id=run_id)
        detail = RunDetail.model_validate(run)
        detail.graph = graph_of(Bundle.model_validate(run.bundle))
        detail.events = [RunEvent(seq=e.seq, t=e.t, kind=e.kind, detail=e.detail) for e in events]
        return detail

    async def cancel_run(self, user_id: UUID, run_id: UUID) -> OrchRun:
        """Stop an active run. The executing task records the outcome; an orphaned run is failed here."""
        run = await self.get_run(user_id, run_id)
        if run.status not in ("queued", "running"):
            raise BadRequestError(
                message="这次运行已经结束，无法取消", details={"status": run.status}
            )
        if registry.cancel(run_id):
            return run
        return await repo.update_run(
            self.db,
            db_run=run,
            update_data={"status": "failed", "error": registry.CANCELLED_MESSAGE},
        )

    async def delete_run(self, user_id: UUID, run_id: UUID) -> None:
        run = await self.get_run(user_id, run_id)
        if run.status in ("queued", "running"):
            registry.cancel(
                run_id
            )  # a deleted run must stop spending tokens, not keep going unseen
        await repo.delete_run(self.db, run_id)

    async def export(self, user_id: UUID, run_id: UUID, fmt: str) -> tuple[bytes, str, str]:
        """(content, filename, media type) of the report a finished run produced."""
        run = await self.get_run(user_id, run_id)
        if run.status != "done" or not run.result or run.result.get("kind") != "report":
            raise BadRequestError(
                message="这次运行没有可导出的报告", details={"status": run.status}
            )
        document = ReportDocument.model_validate(run.result["report"])
        content = render_docx(document) if fmt == "docx" else render_pdf(document)
        name = re.sub(r'[\\/:*?"<>|\s]+', "_", document.title).strip("_")[:80] or "报告"
        return content, f"{name}.{fmt}", _MEDIA_TYPES[fmt]

    # ---- feedback and insights --------------------------------------------------------------------

    async def feedback(self, user_id: UUID, run_id: UUID, data: FeedbackCreate) -> None:
        await self.get_run(user_id, run_id)
        await repo.upsert_feedback(
            self.db,
            run_id=run_id,
            user_id=user_id,
            rating=data.rating,
            tags=data.tags,
            comment=data.comment,
        )

    async def insights(self, user_id: UUID) -> Insights:
        runs = await repo.recent_done_runs(self.db, user_id=user_id, limit=50)
        ids = [r.id for r in runs]
        gates = [
            {"run_id": e.run_id, "round": e.detail.get("round", 0), "passed": bool(e.detail.get("passed")), "failures": e.detail.get("failures", []), "metrics": e.detail.get("metrics", {})}
            for e in await repo.gate_events(self.db, run_ids=ids)
        ]  # fmt: skip
        feedback = [
            {"rating": f.rating, "tags": f.tags}
            for f in await repo.feedback_for_runs(self.db, run_ids=ids)
        ]
        return build_insights([{"id": r.id, "metrics": r.metrics} for r in runs], gates, feedback)

    async def _expire_stale(self, user_id: UUID) -> None:
        items, _ = await repo.list_runs(self.db, user_id=user_id, skip=0, limit=20)
        for run in items:
            if _is_stale(run):
                await repo.update_run(
                    self.db, db_run=run, update_data={"status": "failed", "error": STALE_MESSAGE}
                )

    # ---- used by the background job ---------------------------------------------------------------

    async def exists(self, run_id: UUID) -> bool:
        return await repo.get_run(self.db, run_id) is not None

    async def mark_running(self, run_id: UUID) -> OrchRun | None:
        run = await repo.get_run(self.db, run_id)
        if run is not None:
            await repo.update_run(
                self.db,
                db_run=run,
                update_data={"status": "running", "stage": "准备开始", "progress": 1},
            )
        return run

    async def finish(self, run_id: UUID, *, status: str, result, metrics, error) -> None:
        run = await repo.get_run(self.db, run_id)
        if run is not None:
            await repo.update_run(
                self.db, db_run=run,
                update_data={"status": status, "stage": "已完成" if status == "done" else "失败",
                             "progress": 100 if status == "done" else run.progress,
                             "result": result, "metrics": metrics, "error": (error or None)},
            )  # fmt: skip


def _is_stale(run: OrchRun) -> bool:
    if run.status not in ("queued", "running"):
        return False
    touched = run.updated_at or run.created_at
    return touched is not None and datetime.now(UTC) - touched > timedelta(
        minutes=settings.REPORT_STALE_AFTER_MINUTES
    )
