"""Independent checks on a draft: metrics, failure diagnosis and quality gates.

Pure functions over the report sections, so they are testable without a model. The verifier never trusts the writer:
claims are graded against sources, numbers against the source text, and scope against what the data actually covers.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

from app.services.orchestration.spec import GateSpec
from app.services.research.models import WebSource
from app.services.research.report_data import unsupported_numbers
from app.services.research.report_models import ReportSection

FailureType = Literal["weak_evidence", "unsupported_number", "scope_misplaced", "no_authority"]

FAILURE_LABELS: dict[str, str] = {
    "weak_evidence": "证据不足（说法只有单一来源或未能核实）",
    "unsupported_number": "数字在来源原文中找不到",
    "scope_misplaced": "范围错置（只有单个学校/地区的数据，没有说明不代表整体）",
    "no_authority": "没有权威来源支持",
}

# A scope naming one institution or place; broad words rescue it ("全国普通高校" is not one school).
_NARROW = re.compile(r"([一-鿿]{1,}(大学|学院|学校|职院)(?!生)|某校|某高校|校区|本校|该校)")
_BROAD = re.compile(r"(全国|全省|各地|普通高|全部|所有|总体|整体|各高校)")
_HAS_DIGIT = re.compile(r"\d")
_DISCLOSED = re.compile(r"(不代表|不能外推|不宜外推|不可外推|个别学校|个别地区|仅为.{0,8}样本)")


@dataclass
class Failure:
    section: int
    type: FailureType
    detail: str = ""


@dataclass
class Diagnosis:
    metrics: dict[str, float] = field(default_factory=dict)
    failures: list[Failure] = field(default_factory=list)

    def by_section(self) -> dict[int, list[Failure]]:
        out: dict[int, list[Failure]] = {}
        for f in self.failures:
            out.setdefault(f.section, []).append(f)
        return out


def is_narrow_scope(scope: str) -> bool:
    return bool(_NARROW.search(scope)) and not _BROAD.search(scope)


def diagnose(
    sections: list[ReportSection],
    sources: list[WebSource],
    *,
    topic: str,
    evidence: str | None = None,
) -> Diagnosis:
    tier = {s.index: s.tier for s in sources}
    evidence = evidence if evidence is not None else "\n".join(s.content for s in sources)
    topic_is_local = bool(_NARROW.search(topic))
    diagnosis = Diagnosis()
    claims_total = verified = 0
    authoritative_sections = 0
    unsupported_total = 0
    scope_issues = 0
    for i, section in enumerate(sections):
        weak = [c for c in section.claims if c.level != "verified"]
        claims_total += len(section.claims)
        verified += len(section.claims) - len(weak)
        weak_numeric = [c for c in weak if _HAS_DIGIT.search(c.claim)]
        if weak_numeric:
            diagnosis.failures.append(
                Failure(i, "weak_evidence", f"{len(weak_numeric)} 条带数字的说法证据不足")
            )
        if any(
            c.level == "verified"
            and any(tier.get(n) == "authoritative" for n in c.citation_indices)
            for c in section.claims
        ):
            authoritative_sections += 1
        elif section.claims:
            diagnosis.failures.append(Failure(i, "no_authority", section.heading))
        missing = unsupported_numbers(f"{section.body}\n{section.analysis}", evidence)
        unsupported_total += len(missing)
        if missing:
            diagnosis.failures.append(Failure(i, "unsupported_number", "、".join(missing[:5])))
        scopes = [p.scope for p in section.data_points if p.scope]
        if (
            scopes
            and not topic_is_local
            and all(is_narrow_scope(s) for s in scopes)
            and not _DISCLOSED.search(section.body)
        ):
            scope_issues += 1
            diagnosis.failures.append(
                Failure(i, "scope_misplaced", "、".join(dict.fromkeys(scopes))[:60])
            )
    n = max(len(sections), 1)
    diagnosis.metrics = {
        "verified_ratio": round(verified / claims_total, 3) if claims_total else 1.0,
        "unsupported_numbers": float(unsupported_total),
        "scope_issues": float(scope_issues),
        "authoritative_sections": round(authoritative_sections / n, 3),
        "claims": float(claims_total),
    }
    return diagnosis


def gate_check(gate: GateSpec, diagnosis: Diagnosis) -> tuple[bool, list[str]]:
    m = diagnosis.metrics
    reasons: list[str] = []
    if (
        gate.min_verified_ratio is not None
        and m.get("verified_ratio", 1.0) < gate.min_verified_ratio
    ):
        reasons.append(f"已核实比例 {m['verified_ratio']:.0%} 低于 {gate.min_verified_ratio:.0%}")
    if (
        gate.max_unsupported_numbers is not None
        and m.get("unsupported_numbers", 0) > gate.max_unsupported_numbers
    ):
        reasons.append(f"有 {int(m['unsupported_numbers'])} 个数字在来源里找不到")
    if gate.require_scope_disclosed and m.get("scope_issues", 0) > 0:
        reasons.append(f"{int(m['scope_issues'])} 章只有单校/单地区数据却没有说明不代表整体")
    if (
        gate.min_authoritative_sections is not None
        and m.get("authoritative_sections", 1.0) < gate.min_authoritative_sections
    ):
        reasons.append(
            f"有权威来源支持的章节只占 {m['authoritative_sections']:.0%}，低于 {gate.min_authoritative_sections:.0%}"
        )
    return not reasons, reasons


SCOPE_DISCLOSURE = (
    "（说明：本章可得的公开数据仅来自个别学校或地区的样本，不代表全国整体情况，使用时请勿外推。）"
)
