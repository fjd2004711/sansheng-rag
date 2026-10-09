from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class MissedQuestion(BaseModel):
    message_id: str
    question: str
    kind: Literal["abstained", "partial"]
    reason: str | None = None
    user_email: str
    created_at: datetime


class SourceUsage(BaseModel):
    source: str
    answers: int  # how many recent answers retrieved this document


class Insights(BaseModel):
    days: int
    answers_analysed: int
    abstained: int
    partial: int
    misses: list[MissedQuestion]
    top_sources: list[SourceUsage]
    never_retrieved: list[str]
