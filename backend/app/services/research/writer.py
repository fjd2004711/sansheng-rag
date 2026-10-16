"""Model calls of research mode: plan the searches, then write a cited answer from web evidence."""

from __future__ import annotations

import json
import re
from collections.abc import Awaitable, Callable

from openai import AsyncOpenAI

from app.core.clock import today_zh
from app.core.llm_runtime import current_llm
from app.core.usage_meter import record_openai_response, record_usage
from app.services.rag.guard import UNTRUSTED_NOTE

WEB_ABSTAIN_MESSAGE = "网上没有找到足够可靠的资料来回答这个问题。"

DeltaSink = Callable[[str], Awaitable[None]]


def _client() -> tuple[AsyncOpenAI, str, dict[str, object] | None]:
    llm = current_llm()
    return AsyncOpenAI(base_url=llm.base_url, api_key=llm.api_key), llm.model, llm.extra_body


async def plan_queries(question: str, *, max_queries: int) -> list[str]:
    """Short, distinct search-engine queries covering the question; falls back to the question itself."""
    client, model, extra_body = _client()
    prompt = (
        f"把用户的问题改写成最多 {max_queries} 条搜索引擎查询词，用于在网上查找可核实的资料。要求：每条是简短关键词短语，"
        "彼此角度不同（例如：官方定义/标准、最新数据、权威解读）；涉及时间的问题写出具体年份；"
        '问题是中文就用中文查询。只返回 JSON：{"queries": ["..."]}。\n'
        f"今天：{today_zh()}\n问题：{question}"
    )
    try:
        async with client:
            response = await client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0,
                extra_body=extra_body,
            )
        record_openai_response(response)
        queries = _queries_from(response.choices[0].message.content or "")
    except Exception:
        queries = []
    cleaned: list[str] = []
    for query in [*queries, question]:
        query = " ".join(str(query).split())[:120]
        if query and query not in cleaned:
            cleaned.append(query)
    return cleaned[:max_queries]


def _queries_from(text: str) -> list[str]:
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        return []
    try:
        value = json.loads(match.group(0))
    except json.JSONDecodeError:
        return []
    queries = value.get("queries") if isinstance(value, dict) else None
    return [q for q in queries if isinstance(q, str)] if isinstance(queries, list) else []


async def write_answer(question: str, evidence: str, on_delta: DeltaSink) -> str:
    """Stream an answer that cites the numbered web evidence; returns the full text."""
    client, model, extra_body = _client()
    prompt = (
        "只根据下面编号的网页资料回答问题。每个事实性说法后面用 [1] 这样的编号标注出处，不得编造事实、来源或编号。"
        "数字、日期、定义要和资料原文一致；不同资料说法不一致时，把分歧和各自出处都写出来，不要擅自取舍；"
        "资料只覆盖了部分问题时，回答能确认的部分，并明确说明哪些部分网上资料没有给出。"
        "资料标注了来源等级：优先采用权威来源和参考来源；只有低可信来源（自媒体、论坛、用户上传文档）提到的说法，要写明“仅见于…”。"
        "资料标注了“仅搜索摘要”的，引用时更谨慎。"
        f"如果资料与问题完全无关，只回复：{WEB_ABSTAIN_MESSAGE}\n"
        "用问题的语言作答，结构清晰，先给结论再给依据。\n"
        f"今天：{today_zh()}\n问题：{question}\n资料：\n{evidence[:12000]}"
    )
    parts: list[str] = []
    async with client:
        stream = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": UNTRUSTED_NOTE},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            stream=True,
            stream_options={"include_usage": True},
            extra_body=extra_body,
        )
        async for chunk in stream:
            usage = getattr(chunk, "usage", None)
            if usage is not None:
                record_usage(
                    getattr(usage, "prompt_tokens", 0), getattr(usage, "completion_tokens", 0)
                )
            for choice in chunk.choices or []:
                delta = choice.delta.content if choice.delta else None
                if delta:
                    parts.append(delta)
                    await on_delta(delta)
    return "".join(parts).strip()
