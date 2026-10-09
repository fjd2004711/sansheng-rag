from datetime import datetime
from typing import Literal

from pydantic import BaseModel

Verdict = Literal["verified", "corrected", "partial", "abstained", "unchecked"]


class QualityDay(BaseModel):
    day: str
    answers: int
    passed: int  # verified + corrected
    avg_groundedness: float | None = None


class AttentionAnswer(BaseModel):
    message_id: str
    conversation_id: str
    question: str
    verdict: Verdict
    groundedness: float | None = None
    reason: str | None = None
    rating: int | None = None
    created_at: datetime


class Quality(BaseModel):
    days: int
    scope: Literal["mine", "all"]
    answers: int
    verdicts: dict[str, int]
    avg_groundedness: float | None = None
    avg_completeness: float | None = None
    avg_citation_coverage: float | None = None
    correction_rate: float | None = None  # share of answers that needed any self-correction
    avg_searches: float | None = None
    latency_p50_s: float | None = None
    latency_p90_s: float | None = None
    avg_tokens: int | None = None
    rated: int
    helpful: int
    failure_types: dict[str, int]
    by_day: list[QualityDay]
    attention: list[AttentionAnswer]
