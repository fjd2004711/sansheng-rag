"""Which chat model the current turn talks to.

A user may bring their own OpenAI-compatible endpoint. ``AgentSession`` binds it for the duration
of a turn; every LLM call site resolves through ``current_llm()`` and falls back to the server
defaults from settings, so graph/evaluator code needs no user plumbing.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass

from app.core.config import settings


@dataclass(frozen=True)
class LLMRuntime:
    base_url: str
    api_key: str
    model: str
    disable_thinking: bool = False
    is_custom: bool = False

    @property
    def extra_body(self) -> dict[str, object] | None:
        return {"enable_thinking": False} if self.disable_thinking else None


def server_default_llm() -> LLMRuntime:
    return LLMRuntime(
        base_url=settings.OPENAI_BASE_URL,
        api_key=settings.OPENAI_API_KEY,
        model=settings.AI_MODEL,
        disable_thinking=settings.AI_DISABLE_THINKING,
    )


_current: ContextVar[LLMRuntime | None] = ContextVar("current_llm", default=None)


def current_llm() -> LLMRuntime:
    return _current.get() or server_default_llm()


@contextmanager
def use_llm(runtime: LLMRuntime | None) -> Iterator[None]:
    token = _current.set(runtime)
    try:
        yield
    finally:
        _current.reset(token)
