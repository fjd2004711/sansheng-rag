"""Research reports: start a background build, poll progress, download Word / PDF."""

from typing import Any, Literal
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Query, Response, status

from app.api.deps import CurrentUser, ResearchReportSvc
from app.schemas.research_report import (
    ResearchReportCreate,
    ResearchReportList,
    ResearchReportRead,
    ResearchReportSummary,
)
from app.worker.background import fire_and_forget
from app.worker.background.report import generate_report_in_background

router = APIRouter()


@router.post("", response_model=ResearchReportSummary, status_code=status.HTTP_201_CREATED)
async def create_report(
    data: ResearchReportCreate, service: ResearchReportSvc, user: CurrentUser
) -> Any:
    report = await service.create(user.id, data)
    # The session commits after this handler returns; the job waits until the row is visible.
    fire_and_forget(
        generate_report_in_background(report_id=report.id, user_id=user.id, topic=report.topic),
        label="research.report",
    )
    return report


@router.get("", response_model=ResearchReportList)
async def list_reports(
    service: ResearchReportSvc,
    user: CurrentUser,
    skip: int = Query(0, ge=0, description="Items to skip"),
    limit: int = Query(50, ge=1, le=100, description="Max items to return"),
) -> Any:
    items, total = await service.list(user.id, skip=skip, limit=limit)
    return ResearchReportList(items=items, total=total)  # ty: ignore[invalid-argument-type]


@router.get("/{report_id}", response_model=ResearchReportRead)
async def get_report(report_id: UUID, service: ResearchReportSvc, user: CurrentUser) -> Any:
    return await service.get(user.id, report_id)


@router.get("/{report_id}/download", response_class=Response)
async def download_report(
    report_id: UUID,
    service: ResearchReportSvc,
    user: CurrentUser,
    format: Literal["docx", "pdf"] = Query("pdf", description="docx or pdf"),
) -> Response:
    content, filename, media_type = await service.export(user.id, report_id, format)
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_report(report_id: UUID, service: ResearchReportSvc, user: CurrentUser) -> None:
    await service.delete(user.id, report_id)
