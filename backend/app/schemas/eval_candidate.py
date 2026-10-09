from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.schemas.base import BaseSchema

FailureType = Literal[
    "insufficient_evidence", "ambiguous_query", "out_of_scope", "hallucination", "incomplete"
]


class EvalCandidateCreate(BaseSchema):
    """``expected_phrase`` is required unless the right behaviour is to abstain."""

    question: str = Field(min_length=1, max_length=2000)
    expected_phrase: str = Field(default="", max_length=300)
    abstain: bool = False
    failure_type: FailureType = "insufficient_evidence"
    note: str | None = Field(default=None, max_length=1000)
    source_message_id: UUID | None = None


class EvalCandidateRead(BaseSchema):
    id: UUID
    question: str
    expected_phrase: str
    abstain: bool
    failure_type: str
    note: str | None = None
    created_at: datetime


class EvalCandidateList(BaseSchema):
    items: list[EvalCandidateRead]
