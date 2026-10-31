"""Definitions shipped with the platform. Users can copy them, edit the YAML and run their own variants."""

from __future__ import annotations

from app.services.orchestration.spec import Bundle, parse_bundle

REPORT_YAML = """\
kind: KnowledgeBase
name: official-web
description: 联网检索，优先权威发布方（政府、统计、教育科研、国际组织），按可信度分级
sources:
  - type: web_search
prefer_sites: [moe.gov.cn, mohrss.gov.cn, stats.gov.cn, gov.cn]
retrieval: {dense: true, bm25: true, fusion: rrf, reranker: true}
freshness_days: 365
---
kind: Agent
name: planner
role: 规划师
skill: plan_outline
model_tier: strong
tools: [outline]
---
kind: Agent
name: researcher
role: 检索员
skill: search_web
model_tier: fast
tools: [web_search, page_fetch, corpus_retrieve]
knowledge: [official-web]
---
kind: Agent
name: writer
role: 撰稿人（数据核对 + 分章写作）
skill: write_section
model_tier: strong
tools: [corpus_retrieve, number_quote_check]
knowledge: [official-web]
---
kind: Agent
name: verifier
role: 独立核查员
skill: verify_report
model_tier: strong
independent: true
can_see: [draft, evidence]
tools: [number_check, independence_check, claim_audit]
knowledge: [official-web]
---
kind: Agent
name: repairer
role: 修复员（按失败类型补证、改写）
skill: repair_report
model_tier: strong
tools: [web_search, corpus_retrieve, rewrite_section]
knowledge: [official-web]
---
kind: Agent
name: analyst
role: 分析师（核心结论、综合研判、行动建议）
skill: write_synthesis
model_tier: strong
tools: [corpus_retrieve]
---
kind: Agent
name: editor
role: 主编（统稿与披露）
skill: assemble_report
model_tier: fast
---
kind: Team
name: research-report-team
description: 调研分析报告团队：规划 → 并行检索 → 并行分章 → 独立核查 → 自循环修复 → 综合研判
members: [planner, researcher, writer, verifier, repairer, analyst, editor]
supervisor: planner
---
kind: Workflow
name: verified-report
description: 带独立核查与有界自循环的调研分析报告
team: research-report-team
policy:
  max_tokens: 900000
  max_seconds: 2400
  max_repair_rounds: 2
  search_concurrency: 2
  llm_concurrency: 6
nodes:
  - {id: plan, kind: agent, agent: planner, priority: 1}
  - {id: search, kind: map, agent: researcher, depends_on: [plan], map_over: query_batches, pool: search, priority: 2}
  - {id: sections, kind: map, agent: writer, depends_on: [search], map_over: sections, pool: llm, priority: 3}
  - {id: search_national, kind: map, agent: researcher, depends_on: [search], map_over: national_batches, pool: search, priority: 5, essential: false}
  - {id: verify, kind: map, agent: verifier, depends_on: [sections], map_over: sections, pool: llm, priority: 4}
  - id: gate_sections
    kind: gate
    depends_on: [verify, search_national]
    on_fail: repair
    max_rounds: 2
    pool: none
    gate: {min_verified_ratio: 0.5, max_unsupported_numbers: 0, require_scope_disclosed: true, min_authoritative_sections: 0.5}
  - {id: repair, kind: loop, agent: repairer, essential: false, max_rounds: 2}
  - {id: synthesis, kind: agent, agent: analyst, depends_on: [gate_sections], priority: 5}
  - {id: assemble, kind: merge, agent: editor, depends_on: [synthesis], pool: none, priority: 6}
"""

# A deliberately small second scenario: same platform, different team and workflow. No platform code changes.
FACT_CHECK_YAML = """\
kind: KnowledgeBase
name: official-web
sources:
  - type: web_search
prefer_sites: [gov.cn, stats.gov.cn]
---
kind: Agent
name: extractor
role: 说法抽取员
skill: extract_input_claims
model_tier: fast
---
kind: Agent
name: researcher
role: 检索员
skill: search_claims
model_tier: fast
tools: [web_search, page_fetch]
knowledge: [official-web]
---
kind: Agent
name: verifier
role: 独立核查员
skill: verify_claims
model_tier: strong
independent: true
can_see: [draft, evidence]
knowledge: [official-web]
---
kind: Agent
name: editor
role: 汇总员
skill: assemble_fact_check
model_tier: fast
---
kind: Team
name: fact-check-team
members: [extractor, researcher, verifier, editor]
supervisor: extractor
---
kind: Workflow
name: fact-check
description: 把一段文字里的事实性说法逐条联网查证，输出带出处和等级的核查表
team: fact-check-team
policy:
  max_tokens: 200000
  max_seconds: 900
  search_concurrency: 2
nodes:
  - {id: extract, kind: agent, agent: extractor, priority: 1}
  - {id: search, kind: agent, agent: researcher, depends_on: [extract], pool: search, priority: 2}
  - {id: verify, kind: agent, agent: verifier, depends_on: [search], priority: 3}
  - {id: assemble, kind: merge, agent: editor, depends_on: [verify], pool: none, priority: 4}
"""

BUILTIN_YAML: dict[str, str] = {
    "verified-report": REPORT_YAML,
    "fact-check": FACT_CHECK_YAML,
}


def builtin_bundles() -> dict[str, Bundle]:
    return {name: parse_bundle(text) for name, text in BUILTIN_YAML.items()}
