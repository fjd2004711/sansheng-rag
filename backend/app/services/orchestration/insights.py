"""Turn finished runs, their gate checks and reader feedback into improvement hints (rule-based, human-applied)."""

from __future__ import annotations

from collections import Counter
from typing import Any

from app.schemas.orchestration import Insights
from app.services.orchestration.verification import FAILURE_LABELS

# failure type -> what to change. These are suggestions for a person (or a config change that must pass the gold
# set before release); nothing here edits prompts or policies by itself.
_HINTS = {
    "scope_misplaced": "规划与检索词里加上“全国/总体口径、官方发布”，并提高 max_repair_rounds 之前先看是否能搜到全国数据",
    "weak_evidence": "为该类主题补充权威站点（prefer_sites），或提高每章检索证据数；单一来源多时可增加定向补检索轮次",
    "no_authority": "知识库的 prefer_sites 里补上相关主管部门/统计机构域名，并检查检索词是否点名了发布方",
    "unsupported_number": "收紧撰稿提示词里“数字只能照抄已核对数据”，并检查数据提取是否漏了该指标",
}


def build_insights(
    runs: list[dict[str, Any]], gates: list[dict[str, Any]], feedback: list[dict[str, Any]]
) -> Insights:
    """``runs``: {id, metrics}; ``gates``: {run_id, round, passed, failures:[{type}]}; ``feedback``: {rating, tags}."""
    averages: dict[str, float] = {}
    for key in (
        "wall_seconds",
        "parallel_speedup",
        "repair_rounds",
        "verifier_downgrades",
        "tokens",
    ):
        values = [
            float(r["metrics"][key]) for r in runs if r.get("metrics") and key in r["metrics"]
        ]
        if values:
            averages[key] = round(sum(values) / len(values), 2)

    first_check = [g for g in gates if g["round"] == 0]
    failures = Counter(f["type"] for g in first_check for f in g["failures"])
    needed_repair = {g["run_id"] for g in first_check if not g["passed"]}
    fixed = {g["run_id"] for g in gates if g["round"] > 0 and g["passed"]}
    ratings = Counter("helpful" if f["rating"] > 0 else "not_helpful" for f in feedback)
    tags = Counter(t for f in feedback if f["rating"] < 0 for t in f.get("tags", []))

    hints: list[dict[str, str]] = []
    for ftype, count in failures.most_common(3):
        if ftype in _HINTS:
            hints.append(
                {
                    "signal": f"{FAILURE_LABELS.get(ftype, ftype)}：{count} 次首轮未过质量门",
                    "suggestion": _HINTS[ftype],
                }
            )
    if ratings["not_helpful"] and ratings["not_helpful"] >= ratings["helpful"]:
        hints.append(
            {
                "signal": f"差评 {ratings['not_helpful']} 条不少于好评",
                "suggestion": "按差评标签复盘对应章节，把典型失败加入金标集后再改提示词/策略，指标不退步才发布",
            }
        )
    if averages.get("parallel_speedup", 9) < 1.5 and runs:
        hints.append(
            {
                "signal": f"平均并行加速只有 {averages['parallel_speedup']}×",
                "suggestion": "检查搜索并发和模型并发上限是否过低（policy.search_concurrency / llm_concurrency）",
            }
        )

    return Insights(
        runs=len(runs),
        averages=averages,
        failure_types=dict(failures),
        repair_success_rate=round(len(fixed & needed_repair) / len(needed_repair), 3)
        if needed_repair
        else None,
        ratings=dict(ratings),
        tags=dict(tags),
        hints=hints,
    )
