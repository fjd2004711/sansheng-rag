"""Admin: queue real questions for the evaluation set and export them as scenarios."""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, status
from fastapi.responses import PlainTextResponse

from app.api.deps import CurrentAdmin, EvalCandidateSvc
from app.schemas.eval_candidate import EvalCandidateCreate, EvalCandidateList, EvalCandidateRead

router = APIRouter()


@router.get("/eval-candidates", response_model=EvalCandidateList)
async def list_candidates(service: EvalCandidateSvc, _: CurrentAdmin) -> Any:
    return EvalCandidateList(items=await service.list())  # ty: ignore[invalid-argument-type]


@router.post(
    "/eval-candidates", response_model=EvalCandidateRead, status_code=status.HTTP_201_CREATED
)
async def create_candidate(
    data: EvalCandidateCreate, service: EvalCandidateSvc, admin: CurrentAdmin
) -> Any:
    return await service.create(data, user_id=admin.id)


@router.get("/eval-candidates/export", response_class=PlainTextResponse)
async def export_candidates(service: EvalCandidateSvc, _: CurrentAdmin) -> str:
    """JSON Lines in the format of eval/p5-scenarios.jsonl. Add matching corpus documents before running."""
    return await service.export_jsonl()


@router.delete(
    "/eval-candidates/{candidate_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None
)
async def delete_candidate(candidate_id: UUID, service: EvalCandidateSvc, _: CurrentAdmin) -> None:
    await service.delete(candidate_id)
