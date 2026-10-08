"""P2 state and result models for bounded retrieval self-correction."""

from __future__ import annotations

from enum import StrEnum
from typing import Any, TypedDict

from pydantic import BaseModel, Field

from app.services.rag.models import SearchResult


class FailureType(StrEnum):
    INSUFFICIENT_EVIDENCE = "insufficient_evidence"
    AMBIGUOUS_QUERY = "ambiguous_query"
    OUT_OF_SCOPE = "out_of_scope"
    IRRELEVANT_EVIDENCE = "irrelevant_evidence"


class CorrectionAction(StrEnum):
    REWRITE = "rewrite"
    EXPAND = "expand"
    ABSTAIN = "abstain"
    STOP = "stop"


class EvidenceAssessment(BaseModel):
    relevance_scores: list[float] = Field(default_factory=list)
    sufficient: bool
    missing_information: list[str] = Field(default_factory=list)
    failure_type: FailureType | None = None
    failure_reason: str = ""


class Diagnosis(BaseModel):
    action: CorrectionAction
    rewritten_query: str | None = None
    missing_information: list[str] = Field(default_factory=list)
    failure_type: FailureType = FailureType.INSUFFICIENT_EVIDENCE
    failure_reason: str = ""


class CorrectionTraceEvent(BaseModel):
    step: str
    round: int
    status: str
    detail: dict[str, Any] = Field(default_factory=dict)


class CorrectiveRetrievalResult(BaseModel):
    question: str
    current_query: str
    query_history: list[str]
    retrieved_docs: list[SearchResult]
    relevance_scores: list[float]
    missing_information: list[str]
    failure_type: FailureType | None = None
    failure_reason: str = ""
    retrieval_round: int
    abstained: bool = False
    trace: list[CorrectionTraceEvent] = Field(default_factory=list)


class CorrectiveRetrievalState(TypedDict, total=False):
    question: str
    current_query: str
    query_history: list[str]
    retrieved_docs: list[SearchResult]
    relevance_scores: list[float]
    missing_information: list[str]
    failure_type: str | None
    failure_reason: str
    diagnosis_action: str
    assessment_sufficient: bool
    pending_query: str | None
    abstained: bool
    retrieval_round: int
    trace: list[dict[str, Any]]
