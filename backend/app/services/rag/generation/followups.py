"""Follow-up question suggestions grounded in the evidence that produced an answer."""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Awaitable, Callable

from openai import AsyncOpenAI

from app.core.llm_runtime import current_llm
from app.services.rag.generation.evaluator import _ABSTAIN_MESSAGE, _has_evidence

logger = logging.getLogger(__name__)

MAX_SUGGESTIONS = 3
MAX_QUESTION_CHARS = 40

Complete = Callable[[str], Awaitable[str]]


async def _complete(prompt: str) -> str:
    llm = current_llm()
    client = AsyncOpenAI(base_url=llm.base_url, api_key=llm.api_key)
    response = await client.chat.completions.create(
        model=llm.model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        extra_body=llm.extra_body,
    )
    return response.choices[0].message.content or ""


def parse_suggestions(text: str, asked: str) -> list[str]:
    """Pull a JSON array of short, distinct questions out of a model reply."""
    match = re.search(r"\[[\s\S]*\]", text)
    if not match:
        return []
    try:
        items = json.loads(match.group(0))
    except json.JSONDecodeError:
        return []
    seen = {asked.strip()}
    out: list[str] = []
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, str):
            continue
        question = item.strip()
        if not question or len(question) > MAX_QUESTION_CHARS or question in seen:
            continue
        seen.add(question)
        out.append(question)
    return out[:MAX_SUGGESTIONS]


async def suggest_followups(
    question: str, answer: str, evidence: str, complete: Complete = _complete
) -> list[str]:
    """Return up to three follow-up questions the evidence can answer; empty when there is no answer."""
    if (
        not answer.strip()
        or answer.strip().startswith(_ABSTAIN_MESSAGE)
        or not _has_evidence(evidence)
    ):
        return []
    prompt = (
        "根据下面的资料片段，替用户想出接下来最可能继续问的问题。要求：每个问题不超过 25 个字，"
        "必须能从资料片段里找到答案，不要重复用户已经问过的问题，用中文口语，不要加编号。"
        '只返回 JSON 数组，例如 ["问题一", "问题二", "问题三"]。\n'
        f"用户刚问的问题：{question}\n已给出的回答：{answer[:600]}\n资料片段：\n{evidence[:5000]}"
    )
    try:
        return parse_suggestions(await complete(prompt), question)
    except Exception:
        logger.warning("followup_suggestions_failed", exc_info=True)
        return []
