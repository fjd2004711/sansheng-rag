"""Token accounting for one unit of work (a chat turn, or the follow-up suggestions after it).

Call sites that talk to a model report into whichever meter is bound to the current context;
with no meter bound, recording is a no-op, so evaluators stay usable from scripts and tests.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any


@dataclass
class UsageMeter:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    calls: int = 0

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens

    def add(self, prompt: int, completion: int) -> None:
        self.prompt_tokens += max(0, int(prompt or 0))
        self.completion_tokens += max(0, int(completion or 0))
        self.calls += 1


_meter: ContextVar[UsageMeter | None] = ContextVar("usage_meter", default=None)


@contextmanager
def use_meter(meter: UsageMeter) -> Iterator[UsageMeter]:
    token = _meter.set(meter)
    try:
        yield meter
    finally:
        _meter.reset(token)


def record_usage(prompt: int, completion: int) -> None:
    meter = _meter.get()
    if meter is not None:
        meter.add(prompt, completion)


def record_openai_response(response: Any) -> None:
    """Record ``response.usage`` from an OpenAI-compatible completion (providers may omit it)."""
    usage = getattr(response, "usage", None)
    if usage is not None:
        record_usage(getattr(usage, "prompt_tokens", 0), getattr(usage, "completion_tokens", 0))
