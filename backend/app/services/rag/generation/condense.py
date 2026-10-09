"""Turn a follow-up into a standalone question before retrieval.

"那它的价格呢？" retrieves nothing useful on its own; with the earlier turns it is
"Nebula 的退款审批码是多少？" → "Nebula 退款需要多少审批价格？". Retrieval, the evidence judge and the answer
checks all work from the standalone form, so none of them has to guess what "它" means.
"""

from __future__ import annotations

import logging
import re

from openai import AsyncOpenAI

from app.core.llm_runtime import current_llm
from app.core.usage_meter import record_openai_response

logger = logging.getLogger(__name__)

HISTORY_TURNS = 3
MAX_TURN_CHARS = 400
MAX_QUESTION_CHARS = 200
# A question this long and with no pronoun-ish opener is almost always already self-contained.
_REFERENCE_HINTS = re.compile(
    r"^(那|它|他|她|这|那个|这个|其|还有|另外|然后|所以|为什么|那么|and |what about|how about|why|it |its |that |those |these |they )",
    re.IGNORECASE,
)
_SHORT_QUESTION_CHARS = 14

PROMPT = (
    "Rewrite the user's latest message as one standalone question that can be understood without the "
    "conversation. Resolve pronouns and omitted subjects using the earlier turns. Keep the user's language "
    "and intent; do not answer it and do not add new requirements. If it is already standalone, return it "
    "unchanged. Reply with the question only.\n\nConversation:\n{history}\n\nLatest message: {question}"
)


def needs_condensing(question: str, history: list[dict[str, str]]) -> bool:
    """Cheap gate: skip the model call when there is no context or the question stands alone."""
    if not history:
        return False
    q = question.strip()
    return len(q) <= _SHORT_QUESTION_CHARS or bool(_REFERENCE_HINTS.match(q))


def format_history(history: list[dict[str, str]]) -> str:
    recent = [m for m in history if m["role"] in ("user", "assistant")][-HISTORY_TURNS * 2 :]
    return "\n".join(f"{m['role']}: {m['content'][:MAX_TURN_CHARS]}" for m in recent)


def clean_condensed(text: str, fallback: str) -> str:
    line = next((ln.strip() for ln in text.strip().splitlines() if ln.strip()), "")
    line = re.sub(r"^(standalone question|question|问题)\s*[:：]\s*", "", line, flags=re.IGNORECASE)
    line = line.strip().strip("\"'「」“”")
    return line if line and len(line) <= MAX_QUESTION_CHARS else fallback


async def condense_question(question: str, history: list[dict[str, str]]) -> str:
    """The standalone form of ``question``; the original on any failure or when not needed."""
    if not needs_condensing(question, history):
        return question
    llm = current_llm()
    try:
        client = AsyncOpenAI(base_url=llm.base_url, api_key=llm.api_key)
        response = await client.chat.completions.create(
            model=llm.model,
            messages=[
                {
                    "role": "user",
                    "content": PROMPT.format(history=format_history(history), question=question),
                }
            ],
            temperature=0,
            extra_body=llm.extra_body,
        )
        record_openai_response(response)
        return clean_condensed(response.choices[0].message.content or "", question)
    except Exception:
        logger.warning("question_condense_failed", exc_info=True)
        return question
