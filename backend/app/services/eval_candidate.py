"""Turning real user questions into evaluation scenarios (human-curated, never auto-added)."""

import json
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, NotFoundError
from app.db.models.eval_candidate import EvalCandidate
from app.schemas.eval_candidate import EvalCandidateCreate


def to_scenario_line(candidate: EvalCandidate) -> str:
    """One line in the format of ``eval/p5-scenarios.jsonl`` (initial_query defaults to the question)."""
    return json.dumps(
        {
            "id": f"real-{str(candidate.id)[:8]}",
            "question": candidate.question,
            "initial_query": candidate.question,
            "expected_phrase": "" if candidate.abstain else candidate.expected_phrase,
            "failure_type": "out_of_scope" if candidate.abstain else candidate.failure_type,
            "abstain": candidate.abstain,
        },
        ensure_ascii=False,
    )


class EvalCandidateService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: EvalCandidateCreate, *, user_id: UUID) -> EvalCandidate:
        if not data.abstain and not data.expected_phrase.strip():
            raise BadRequestError(message="请填写正确答案里必须出现的关键词，或勾选“应当拒答”")
        candidate = EvalCandidate(
            question=data.question.strip(),
            expected_phrase=data.expected_phrase.strip(),
            abstain=data.abstain,
            failure_type=data.failure_type,
            note=data.note,
            source_message_id=data.source_message_id,
            created_by=user_id,
        )
        self.db.add(candidate)
        await self.db.flush()
        await self.db.refresh(candidate)
        return candidate

    async def list(self) -> list[EvalCandidate]:
        result = await self.db.execute(
            select(EvalCandidate).order_by(EvalCandidate.created_at.desc())
        )
        return list(result.scalars().all())

    async def delete(self, candidate_id: UUID) -> None:
        result = await self.db.execute(
            delete(EvalCandidate).where(EvalCandidate.id == candidate_id)
        )
        if not result.rowcount:
            raise NotFoundError(message="Candidate not found", details={"id": str(candidate_id)})
        await self.db.flush()

    async def export_jsonl(self) -> str:
        lines = [to_scenario_line(c) for c in reversed(await self.list())]
        return "\n".join(lines) + ("\n" if lines else "")
