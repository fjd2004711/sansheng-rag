"""Model calls of the report pipeline. Every number the model returns is checked in ``report_data``."""

from __future__ import annotations

import json
import re
from typing import Any

from openai import AsyncOpenAI

from app.core.clock import today_zh
from app.core.llm_runtime import current_llm
from app.core.usage_meter import record_openai_response
from app.services.rag.guard import UNTRUSTED_NOTE
from app.services.research.report_data import display_value
from app.services.research.report_models import DataPoint, OutlineSection, ReportOutline


async def _complete(prompt: str, *, temperature: float = 0) -> str:
    llm = current_llm()
    async with AsyncOpenAI(base_url=llm.base_url, api_key=llm.api_key) as client:
        response = await client.chat.completions.create(
            model=llm.model,
            messages=[
                {"role": "system", "content": UNTRUSTED_NOTE},
                {"role": "user", "content": prompt},
            ],
            temperature=temperature,
            extra_body=llm.extra_body,
        )
    record_openai_response(response)
    return response.choices[0].message.content or ""


def _json(text: str) -> dict[str, Any]:
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        return {}
    try:
        value = json.loads(match.group(0))
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


async def plan_outline(topic: str, *, max_sections: int) -> ReportOutline:
    prompt = (
        f"为一份基于权威公开数据的调研报告设计提纲。主题：{topic}\n"
        f"要求：{max_sections - 2}～{max_sections} 个章节，覆盖总体规模、关键指标、结构/分布、变化趋势、原因与影响等角度；"
        "不要写“引言”“结论”章节（系统会自动生成摘要和结论）。"
        "每章给出：heading（章节标题）、goal（这一章要用数据回答的问题，一句话）、"
        "indicators（需要的具体数据指标，2～4 个，如“2025届高校毕业生人数”）、"
        "queries（2 条搜索词，优先指向权威发布方，如教育部、国家统计局、人社部、统计公报、白皮书；涉及时间写具体年份）。"
        f"再给报告一个准确的标题 title。今天：{today_zh()}。\n"
        '只返回 JSON：{"title": "...", "sections": [{"heading": "...", "goal": "...", "indicators": ["..."], "queries": ["..."]}]}'
    )
    data = _json(await _complete(prompt))
    sections = []
    for item in data.get("sections") or []:
        try:
            section = OutlineSection.model_validate(item)
        except Exception:
            continue
        if section.heading.strip() and section.goal.strip():
            sections.append(section)
    if not sections:
        sections = [OutlineSection(heading=topic, goal=topic, queries=[topic], indicators=[])]
    title = str(data.get("title") or "").strip() or f"{topic}调研报告"
    return ReportOutline(title=title, sections=sections[:max_sections])


async def extract_data_points(
    section: OutlineSection, evidence: str, *, already_used: list[str] | None = None
) -> list[DataPoint]:
    prompt = (
        "从下面编号资料中摘出与本章相关的数据。只摘资料原文里明确写出的数字，不要计算、换算或推测。"
        "每条给出：indicator（指标名；同一指标在不同年份、不同资料中必须用完全相同的名称）、"
        "value（原文中的数值，照抄，只写数字部分，如“1222”“5.0%”“12.4”，不要带“万人”等单位）、unit（单位，如“万人”“%”）、"
        "period（对应的年份/时间，如“2025届”“2024年”）、scope（统计范围，如“全国”“本科”“某高校”“某省”，必须如实写明，"
        "单个学校或地区的数据不能写成全国）、"
        "source（资料编号）、quote（包含这个数值的原文句子，必须一字不差地从该资料复制，不超过 120 字）。"
        "同一指标不同年份的数据都要摘出，便于看趋势。最多 20 条。\n"
        f"本章：{section.heading}——{section.goal}\n需要的指标：{'、'.join(section.indicators) or '（不限）'}\n"
        "只摘和本章问题直接相关的数据；"
        + (
            f"前面章节已经用过的数据不要重复摘：{'；'.join(already_used[:40])}\n"
            if already_used
            else "\n"
        )
        + '只返回 JSON：{"data": [{"indicator": "...", "value": "...", "unit": "...", "period": "...", "scope": "", '
        '"source": 1, "quote": "..."}]}\n'
        f"资料：\n{evidence[:14000]}"
    )
    points = []
    for item in _json(await _complete(prompt)).get("data") or []:
        try:
            points.append(DataPoint.model_validate(item))
        except Exception:
            continue
    return points


_FACTS_MARK = "【事实与数据】"
_ANALYSIS_MARK = "【分析】"


async def write_section(
    topic: str, section: OutlineSection, evidence: str, data: list[DataPoint]
) -> tuple[str, str]:
    """Return (facts, analysis): facts cite [n] for every statement; analysis interprets them.

    Plain text with two section marks instead of JSON: long Chinese prose with quotes breaks JSON too often.
    """
    facts = "\n".join(
        f"- {p.indicator}（{p.period}{'，' + p.scope if p.scope else ''}）：{display_value(p)} [{p.source}]"
        for p in data
    )
    prompt = (
        f"你在写调研报告《{topic}》中的一章：{section.heading}。这一章要回答：{section.goal}\n"
        f"按下面格式输出两部分，不要输出其他内容：\n{_FACTS_MARK}\n（正文）\n{_ANALYSIS_MARK}\n（分析）\n"
        f"{_FACTS_MARK}：用 2～4 段文字陈述资料中的事实和数据。每个事实后用 [n] 标注资料编号；"
        "数字只能使用“已核对数据”或资料原文中的数字，照抄，不得自行计算或估算；"
        "每个数据都写明它的时间和统计范围；单个学校、单个地区或某行业的数据只能说明该范围，不能当作全国情况；"
        "不同资料数据不一致时，并列写出各自数值和出处；资料没有覆盖的指标，用一句话说明“公开资料中未找到…”。"
        "优先采用权威来源，只出现在低可信来源中的数据要写明“仅见于…”。只写和本章问题有关的内容。\n"
        f"{_ANALYSIS_MARK}：1～2 段分析，基于上面的事实解读趋势、结构变化、可能原因和影响。"
        "引用事实时同样标注 [n]；资料里没有说明的原因或判断，要写成“可能”“推测”，不能写成定论。\n"
        f"今天：{today_zh()}\n已核对数据：\n{facts or '（无）'}\n资料：\n{evidence[:12000]}"
    )
    for _ in range(2):
        body, analysis = _split_section(await _complete(prompt, temperature=0.2))
        if body:
            return body, analysis
    return "", ""


def _split_section(text: str) -> tuple[str, str]:
    if _FACTS_MARK not in text:
        return text.strip(), ""
    after = text.split(_FACTS_MARK, 1)[1]
    body, _, analysis = after.partition(_ANALYSIS_MARK)
    return body.strip(), analysis.strip()


async def write_summary(topic: str, sections: list[tuple[str, str]], evidence: str) -> str:
    body = "\n\n".join(f"## {heading}\n{text}" for heading, text in sections)
    prompt = (
        f"为调研报告《{topic}》写“核心结论”：3～6 条要点，每条一句话，带关键数字和 [n] 出处编号（沿用正文编号）。"
        "只能总结正文已有的内容，不得引入新数字或新事实；用“- ”开头的列表输出，不要其他文字。\n"
        f"正文：\n{body[:12000]}\n资料：\n{evidence[:6000]}"
    )
    return (await _complete(prompt)).strip()
