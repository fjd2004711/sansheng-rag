"""Orchestration platform: definitions (agents, teams, workflows), runs, replay, feedback and insights."""

from typing import Any, Literal
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Query, Response, status

from app.api.deps import CurrentUser, OrchestrationSvc
from app.schemas.orchestration import (
    FeedbackCreate,
    Insights,
    RunCreate,
    RunDetail,
    RunList,
    RunSummary,
    SpecList,
    SpecRead,
    SpecValidate,
    SpecValidation,
)
from app.worker.background import fire_and_forget
from app.worker.background.orchestration import execute_run_in_background

router = APIRouter()


@router.get("/specs", response_model=SpecList)
async def list_specs(service: OrchestrationSvc, user: CurrentUser) -> Any:
    return SpecList(items=await service.list_specs(user.id))


@router.post("/specs/validate", response_model=SpecValidation)
async def validate_spec(data: SpecValidate, service: OrchestrationSvc, user: CurrentUser) -> Any:
    return service.validate(data.yaml)


@router.post("/specs", response_model=SpecRead, status_code=status.HTTP_201_CREATED)
async def save_spec(data: SpecValidate, service: OrchestrationSvc, user: CurrentUser) -> Any:
    return await service.save_spec(user.id, data.yaml)


@router.delete("/specs/{name}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_spec(name: str, service: OrchestrationSvc, user: CurrentUser) -> None:
    await service.delete_spec(user.id, name)


@router.post("/runs", response_model=RunSummary, status_code=status.HTTP_201_CREATED)
async def create_run(data: RunCreate, service: OrchestrationSvc, user: CurrentUser) -> Any:
    run = await service.create_run(user.id, data)
    # The session commits after this handler returns; the job waits until the row is visible.
    fire_and_forget(
        execute_run_in_background(run_id=run.id, user_id=user.id), label="orchestration.run"
    )
    return run


@router.get("/runs", response_model=RunList)
async def list_runs(
    service: OrchestrationSvc,
    user: CurrentUser,
    skip: int = Query(0, ge=0, description="Items to skip"),
    limit: int = Query(50, ge=1, le=100, description="Max items to return"),
) -> Any:
    items, total = await service.list_runs(user.id, skip=skip, limit=limit)
    return RunList(items=items, total=total)  # ty: ignore[invalid-argument-type]


@router.get("/runs/{run_id}", response_model=RunDetail)
async def get_run(run_id: UUID, service: OrchestrationSvc, user: CurrentUser) -> Any:
    return await service.run_detail(user.id, run_id)


@router.delete("/runs/{run_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_run(run_id: UUID, service: OrchestrationSvc, user: CurrentUser) -> None:
    await service.delete_run(user.id, run_id)


@router.get("/runs/{run_id}/download", response_class=Response)
async def download_run_report(
    run_id: UUID,
    service: OrchestrationSvc,
    user: CurrentUser,
    format: Literal["docx", "pdf"] = Query("pdf", description="docx or pdf"),
) -> Response:
    content, filename, media_type = await service.export(user.id, run_id, format)
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


@router.post("/runs/{run_id}/feedback", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def run_feedback(
    run_id: UUID, data: FeedbackCreate, service: OrchestrationSvc, user: CurrentUser
) -> None:
    await service.feedback(user.id, run_id, data)


@router.get("/insights", response_model=Insights)
async def insights(service: OrchestrationSvc, user: CurrentUser) -> Any:
    return await service.insights(user.id)
