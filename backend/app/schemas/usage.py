"""Schemas for token usage statistics."""

from pydantic import BaseModel


class UsageTotals(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    turns: int


class UsageDay(BaseModel):
    day: str
    total_tokens: int


class UsageBySource(BaseModel):
    source: str  # server | custom
    model: str
    total_tokens: int


class UsageSummary(BaseModel):
    days: int
    totals: UsageTotals
    today: UsageTotals
    by_day: list[UsageDay]
    by_source: list[UsageBySource]


class AdminUsageRow(BaseModel):
    email: str
    source: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    records: int


class AdminUsage(BaseModel):
    days: int
    items: list[AdminUsageRow]
