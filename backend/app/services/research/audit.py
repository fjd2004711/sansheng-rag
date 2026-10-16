"""Cross-check every claim of a research answer against the numbered web sources.

The model only *extracts*: the atomic claims, which sources state each one and which contradict it, and
whether it is time-sensitive. The confidence level is then decided by fixed rules in ``grade_claim`` so a
reviewer can reproduce every verdict from the source list:

- verified: backed by an authoritative source read in full, or by ≥2 independent sites of which at
  least one is not low-credibility;
- disputed: a source that is not low-credibility contradicts it;
- single_source: backed, but only by one site, or only by low-credibility sites;
- unverified: no source backs it.
A time-sensitive claim whose newest backing source is undated or older than ``stale_days`` is flagged stale.
"""

from __future__ import annotations

import json
import re
from datetime import date
from typing import Any, Literal

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from app.core.clock import today_zh
from app.core.llm_runtime import current_llm
from app.core.usage_meter import record_openai_response
from app.services.rag.guard import UNTRUSTED_NOTE
from app.services.research.credibility import TIER_LABELS, registrable_domain
from app.services.research.models import WebSource

Level = Literal["verified", "single_source", "disputed", "unverified"]

LEVEL_LABELS: dict[str, str] = {
    "verified": "已核实",
    "single_source": "单一来源",
    "disputed": "有争议",
    "unverified": "未能核实",
}
_MAX_CLAIMS = 12
# Above this many single-source claims the summary counts them instead of listing each one.
_LISTED_SINGLE_SOURCE = 3


class ExtractedClaim(BaseModel):
    claim: str
    supporting: list[int] = Field(default_factory=list)
    contradicting: list[int] = Field(default_factory=list)
    time_sensitive: bool = False
    note: str = ""


class AuditedClaim(BaseModel):
    claim: str
    level: Level
    supported: bool
    citation_indices: list[int]
    contradicting: list[int]
    domains: list[str]
    stale: bool = False
    reason: str


class ClaimAudit(BaseModel):
    claims: list[AuditedClaim]

    @property
    def counts(self) -> dict[str, int]:
        counts = dict.fromkeys(LEVEL_LABELS, 0)
        for claim in self.claims:
            counts[claim.level] += 1
        return counts

    def needs_corroboration(self) -> list[AuditedClaim]:
        """Claims worth one more targeted search: disputed first, then single-source."""
        order = {"disputed": 0, "single_source": 1}
        return sorted((c for c in self.claims if c.level in order), key=lambda c: order[c.level])


async def extract_claims(question: str, answer: str, evidence: str) -> list[ExtractedClaim]:
    llm = current_llm()
    prompt = (
        f"把下面“回答”里的内容拆成最多 {_MAX_CLAIMS} 条独立的事实性说法（数字、日期、定义、因果、归属等；不要拆出纯过渡语或建议）。"
        "只能拆回答里写了的内容，资料里有而回答没写的一律不要列出。"
        "只拆关于事实本身的说法；“某资料写了…”“资料之间不一致”“引用时需注意”这类描述资料或提醒读者的话不要列出，"
        "但要把其中的事实内容（如“某数值为…”）作为说法列出。"
        "“公开资料中未找到…”“没有公开数据”这类说明缺少资料的话不是事实说法，不要列出。"
        "对每条说法，必须逐份检查全部编号资料（回答里的引用编号已去掉，不能只看某一份）："
        "supporting 列出所有明确陈述了这条说法的资料编号（意思相同即可，不要求字面一致，一份都不要漏）；"
        "contradicting 列出给出不同数字、日期或相反结论的资料编号；两者都只能用资料里真实存在的编号。"
        "time_sensitive 表示这条说法会随时间变化（如最新数据、现行政策、价格、排名、在任人员）。"
        "note 用一句中文说明判断依据，有矛盾时写清各方说法。"
        '只返回 JSON：{"claims": [{"claim": "...", "supporting": [1], "contradicting": [], '
        '"time_sensitive": false, "note": "..."}]}。\n'
        f"今天：{today_zh()}\n问题：{question}\n回答：{_strip_citations(answer)}\n资料：\n{evidence[:14000]}"
    )
    async with AsyncOpenAI(base_url=llm.base_url, api_key=llm.api_key) as client:
        response = await client.chat.completions.create(
            model=llm.model,
            messages=[
                {"role": "system", "content": UNTRUSTED_NOTE},
                {"role": "user", "content": prompt},
            ],
            temperature=0,
            extra_body=llm.extra_body,
        )
    record_openai_response(response)
    claims = _parse_claims(response.choices[0].message.content or "")
    return [
        claim
        for claim in claims
        if claim_in_answer(claim.claim, answer) and not is_absence_statement(claim.claim)
    ]


_ABSENCE = re.compile(
    r"(未|没有|无法|尚未|暂未|未能)(找到|查到|公开|公布|发布|获取|检索到|见到)|未见"
)


def is_absence_statement(claim: str) -> bool:
    """ "公开资料中未找到…" reports a gap in the sources; it is not a fact to grade."""
    return bool(_ABSENCE.search(claim))


def _strip_citations(answer: str) -> str:
    """Hide the writer's [n] markers so support is judged against every source, not just the cited one."""
    return re.sub(r"\s*\[\d+\]", "", answer)


_NUMBER = re.compile(r"\d+(?:\.\d+)?")
_CJK_OR_WORD = re.compile(r"[\u4e00-\u9fff]|[a-z]+")


def claim_in_answer(claim: str, answer: str, *, min_overlap: float = 0.6) -> bool:
    """Guard against claims the model lifted from the sources instead of the answer.

    Every number in the claim must occur in the answer, and most of its characters/words must too.
    """
    plain = _strip_citations(answer).replace(",", "").replace("，", "")
    answer_numbers = set(_NUMBER.findall(plain))
    if any(n not in answer_numbers for n in _NUMBER.findall(claim.replace(",", ""))):
        return False
    tokens = _CJK_OR_WORD.findall(claim.lower())
    if not tokens:
        return True
    answer_tokens = set(_CJK_OR_WORD.findall(plain.lower()))
    return sum(t in answer_tokens for t in tokens) / len(tokens) >= min_overlap


def _parse_claims(text: str) -> list[ExtractedClaim]:
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        return []
    try:
        raw = json.loads(match.group(0)).get("claims")
    except (json.JSONDecodeError, AttributeError):
        return []
    claims = []
    for item in raw if isinstance(raw, list) else []:
        try:
            claim = ExtractedClaim.model_validate(item)
        except Exception:
            continue
        if claim.claim.strip():
            claims.append(claim)
    return claims[:_MAX_CLAIMS]


def grade_claim(
    claim: ExtractedClaim, sources: dict[int, WebSource], *, today: date, stale_days: int
) -> AuditedClaim:
    backing = [sources[i] for i in dict.fromkeys(claim.supporting) if i in sources]
    against = [
        sources[i]
        for i in dict.fromkeys(claim.contradicting)
        if i in sources and i not in claim.supporting
    ]
    sites = list(dict.fromkeys(registrable_domain(s.url) for s in backing))
    credible_sites = {registrable_domain(s.url) for s in backing if s.tier != "low"}
    authoritative_full = [s for s in backing if s.tier == "authoritative" and not s.from_snippet]
    credible_against = [s for s in against if s.tier != "low"]

    if credible_against and backing:
        level: Level = "disputed"
        reason = f"{_cite(backing)} 支持，{_cite(credible_against)} 说法不同" + (
            f"：{claim.note}" if claim.note else ""
        )
    elif credible_against:
        level, reason = "unverified", f"没有资料支持，{_cite(credible_against)} 说法与之不同"
    elif not backing:
        level, reason = "unverified", "没有找到明确陈述这一点的资料"
    elif authoritative_full:
        level = "verified"
        reason = f"权威来源 {_cite(authoritative_full)} 原文支持" + (
            f"，另有 {len(sites) - 1} 个网站印证" if len(sites) > 1 else ""
        )
    elif len(sites) >= 2 and credible_sites:
        level, reason = "verified", f"{len(sites)} 个独立网站一致：{'、'.join(sites)}"
    elif len(sites) >= 2:
        level, reason = (
            "single_source",
            f"只有低可信来源提到（{'、'.join(sites)}），缺少权威或参考来源印证",
        )
    else:
        tier = TIER_LABELS[backing[0].tier]
        level, reason = "single_source", f"只有 {sites[0]}（{tier}）一个网站提到"
        if backing[0].from_snippet:
            reason += "，且只读到搜索摘要"

    stale = claim.time_sensitive and _is_stale(backing, today=today, stale_days=stale_days)
    if stale:
        reason += "；这是会随时间变化的信息，支持它的资料没有日期或已超过一年，可能过时"
    return AuditedClaim(
        claim=claim.claim.strip(),
        level=level,
        supported=level in ("verified", "single_source"),
        citation_indices=[s.index for s in backing],
        contradicting=[s.index for s in against],
        domains=sites,
        stale=stale,
        reason=reason,
    )


def _cite(sources: list[WebSource]) -> str:
    return "".join(f"[{s.index}]" for s in sources)


def _is_stale(backing: list[WebSource], *, today: date, stale_days: int) -> bool:
    dates = [d for d in (_parse_date(s.published_at) for s in backing) if d is not None]
    return not dates or (today - max(dates)).days > stale_days


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    match = re.match(r"(\d{4})(?:[-/.年](\d{1,2}))?(?:[-/.月](\d{1,2}))?", value.strip())
    if not match:
        return None
    year, month, day = int(match.group(1)), int(match.group(2) or 1), int(match.group(3) or 1)
    try:
        return date(year, month, day)
    except ValueError:
        return None


def audit_claims(
    extracted: list[ExtractedClaim], sources: list[WebSource], *, today: date, stale_days: int
) -> ClaimAudit:
    by_index = {s.index: s for s in sources}
    return ClaimAudit(
        claims=[grade_claim(c, by_index, today=today, stale_days=stale_days) for c in extracted]
    )


def corroboration_query(claim: AuditedClaim) -> str:
    """A search for an independent, preferably official source on one claim."""
    text = re.sub(r"\[\d+\]", "", claim.claim)
    # Keep "." and "/" so numbers and units such as 32.7米/秒 stay searchable.
    text = re.sub(r"[，。；：、“”‘’（）()\"'!?！？,;:]", " ", text)
    text = " ".join(text.split())[:40]
    return f"{text} 官方" if re.search(r"[一-鿿]", text) else f"{text} official"


def summary_markdown(audit: ClaimAudit) -> str:
    """The "核实情况" section appended to the answer: counts plus every claim that is not verified."""
    if not audit.claims:
        return ""
    counts = audit.counts
    head = "、".join(f"{LEVEL_LABELS[k]} {v} 条" for k, v in counts.items() if v)
    lines = [f"**核实情况**：共 {len(audit.claims)} 条说法，{head}。"]
    icons = {"disputed": "⚠️ 有争议", "unverified": "❓ 未能核实", "single_source": "ℹ️ 单一来源"}
    for level in ("disputed", "unverified"):
        for claim in audit.claims:
            if claim.level == level:
                lines.append(f"- {icons[level]}：{claim.claim}（{claim.reason}）")
    single = [claim for claim in audit.claims if claim.level == "single_source"]
    if len(single) <= _LISTED_SINGLE_SOURCE:
        lines.extend(f"- {icons['single_source']}：{c.claim}（{c.reason}）" for c in single)
    else:
        lines.append(
            f"- {icons['single_source']}：另有 {len(single)} 条说法只找到一个来源，逐条见“逐条核验”清单"
        )
    for claim in audit.claims:
        if claim.stale and claim.level == "verified":
            lines.append(f"- 🕒 可能过时：{claim.claim}（{claim.reason}）")
    return "\n".join(lines)


def audit_event(audit: ClaimAudit, *, round_: int) -> dict[str, Any]:
    counts = audit.counts
    status = "PASS" if audit.claims and counts["verified"] == len(audit.claims) else "COMPLETE"
    if counts["disputed"] or counts["unverified"]:
        status = "FAIL"
    return {
        "step": "claim_audit",
        "round": round_,
        "status": status if audit.claims else "EMPTY",
        "detail": {"counts": counts, "claims": [c.model_dump() for c in audit.claims]},
    }
