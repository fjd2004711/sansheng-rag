"""P3 models for bounded generation self-correction."""

from __future__ import annotations

from enum import StrEnum
from typing import Any, TypedDict

from pydantic import BaseModel, Field


class AnswerFailureType(StrEnum):
    HALLUCINATION = "hallucination"
    INSUFFICIENT_EVIDENCE = "insufficient_evidence"
    INCOMPLETE = "incomplete"
    OUT_OF_SCOPE = "out_of_scope"


class ClaimVerification(BaseModel):
    claim: str
    supported: bool
    citation_indices: list[int] = Field(default_factory=list)
    reason: str = ""


class AnswerAssessment(BaseModel):
    groundedness: float = Field(ge=0, le=1)
    completeness: float = Field(ge=0, le=1)
    answer_relevance: float = Field(ge=0, le=1)
    citation_coverage: float = Field(ge=0, le=1)
    sufficient: bool
    failure_type: AnswerFailureType | None = None
    failure_reason: str = ""
    missing_information: list[str] = Field(default_factory=list)
    claims: list[ClaimVerification] = Field(default_factory=list)


class AnswerDiagnosis(BaseModel):
    failure_type: AnswerFailureType
    sub_query: str | None = None
    failure_reason: str = ""
    missing_information: list[str] = Field(default_factory=list)


class GenerationTraceEvent(BaseModel):
    step: str
    round: int
    status: str
    detail: dict[str, Any] = Field(default_factory=dict)


class GenerationCorrectionResult(BaseModel):
    answer: str
    evidence: str
    assessment: AnswerAssessment
    correction_round: int
    abstained: bool = False
    trace: list[GenerationTraceEvent] = Field(default_factory=list)


class GenerationCorrectionState(TypedDict, total=False):
    question: str
    answer: str
    evidence: str
    assessment: AnswerAssessment
    diagnosis: AnswerDiagnosis
    sub_query: str | None
    failure_type: str | None
    failure_reason: str
    missing_information: list[str]
    correction_round: int
    abstained: bool
    trace: list[dict[str, Any]]
