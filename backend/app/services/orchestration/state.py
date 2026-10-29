"""What a run knows while it executes: shared state, the model controller and the budget."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

from app.core.llm_runtime import LLMRuntime, server_default_llm
from app.core.usage_meter import UsageMeter
from app.services.orchestration.spec import ModelTier, PolicySpec
from app.services.research.corpus import WebCorpus
from app.services.research.report_builder import ReportBuilder, TraceLog
from app.services.research.report_models import ReportOutline, ReportSection


class ModelController:
    """The primary model plus fallbacks. A model that fails with a quota/availability error is dropped for the run."""

    def __init__(self, base: LLMRuntime, policy: PolicySpec) -> None:
        self._base = base
        names = [base.model, *[m for m in policy.fallback_models if m != base.model]]
        self._models = names
        self._fast = policy.fast_model
        self.switches: list[dict[str, str]] = []

    def runtime(self, tier: ModelTier = "strong") -> LLMRuntime:
        model = self._fast if tier == "fast" and self._fast else self._models[0]
        return LLMRuntime(
            base_url=self._base.base_url,
            api_key=self._base.api_key,
            model=model,
            disable_thinking=self._base.disable_thinking,
            is_custom=self._base.is_custom,
        )

    @property
    def current(self) -> str:
        return self._models[0]

    def demote(self, reason: str) -> bool:
        if len(self._models) <= 1:
            return False
        dropped = self._models.pop(0)
        self.switches.append({"from": dropped, "to": self._models[0], "reason": reason[:120]})
        return True


@dataclass
class Budget:
    max_tokens: int
    max_seconds: int
    meter: UsageMeter
    started: float = field(default_factory=time.monotonic)

    @property
    def elapsed(self) -> float:
        return time.monotonic() - self.started

    def used_fraction(self) -> float:
        """How much of the tighter of the two budgets (tokens, time) is spent."""
        return max(self.meter.total_tokens / self.max_tokens, self.elapsed / self.max_seconds)

    def ok(self) -> bool:
        return self.meter.total_tokens < self.max_tokens and self.elapsed < self.max_seconds

    def hard_limit_hit(self) -> bool:
        return (
            self.meter.total_tokens > self.max_tokens * 1.5 or self.elapsed > self.max_seconds * 1.5
        )


@dataclass
class RunState:
    """Mutable data the skills pass to each other; nodes only communicate through this."""

    topic: str
    input: dict[str, Any]
    builder: ReportBuilder | None = None
    corpus: WebCorpus | None = None
    log: TraceLog = field(default_factory=TraceLog)
    outline: ReportOutline | None = None
    queries: list[str] = field(default_factory=list)
    sections: dict[int, ReportSection] = field(default_factory=dict)
    kept: dict[int, int] = field(default_factory=dict)
    rejected: dict[int, int] = field(default_factory=dict)
    summary: str = ""
    summary_claims: list[Any] = field(default_factory=list)
    synthesis: tuple[Any, ...] = ("", "", [], [])
    notes: list[str] = field(default_factory=list)
    repairs: list[dict[str, Any]] = field(default_factory=list)
    overturned: int = 0
    result: dict[str, Any] | None = None
    # fact-check scenario
    claims_input: list[Any] = field(default_factory=list)
    graded: list[Any] = field(default_factory=list)

    def ordered_sections(self) -> list[ReportSection]:
        return [self.sections[i] for i in sorted(self.sections)]


def default_runtime() -> LLMRuntime:
    return server_default_llm()
