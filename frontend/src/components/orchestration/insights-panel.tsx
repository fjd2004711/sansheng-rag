"use client";

import { useInsights } from "@/hooks/use-orchestration";

const FAILURE_LABELS: Record<string, string> = {
  weak_evidence: "证据不足",
  no_authority: "缺权威来源",
  unsupported_number: "数字对不上原文",
  scope_misplaced: "范围错置",
};

/** What the gate checks and reader feedback of recent runs say should change (applied by a person, gated by evals). */
export function InsightsPanel({ refreshKey }: { refreshKey: unknown }) {
  const insights = useInsights(refreshKey);
  if (!insights) return <p className="text-muted-foreground text-sm">加载中…</p>;
  if (insights.runs === 0)
    return <p className="text-muted-foreground text-sm">还没有完成的运行，跑一次再来看。</p>;
  const avg = insights.averages;
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-xs">
        基于最近 {insights.runs}{" "}
        次完成的运行。改进建议只是提示：改提示词或策略后，必须在金标集上指标不退步才能发布。
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        {[
          ["平均耗时", avg.wall_seconds !== undefined ? `${Math.round(avg.wall_seconds)} 秒` : "—"],
          ["平均并行加速", avg.parallel_speedup !== undefined ? `${avg.parallel_speedup}×` : "—"],
          [
            "自循环修复成功率",
            insights.repair_success_rate === null
              ? "—"
              : `${Math.round(insights.repair_success_rate * 100)}%`,
          ],
          [
            "平均核查员下调",
            avg.verifier_downgrades !== undefined ? `${avg.verifier_downgrades} 条` : "—",
          ],
          [
            "好评 / 差评",
            `${insights.ratings.helpful ?? 0} / ${insights.ratings.not_helpful ?? 0}`,
          ],
          ["平均 token", avg.tokens !== undefined ? String(Math.round(avg.tokens)) : "—"],
        ].map(([label, value]) => (
          <div key={label} className="bg-card rounded-lg border p-3">
            <div className="text-muted-foreground text-xs">{label}</div>
            <div className="text-lg font-semibold">{value}</div>
          </div>
        ))}
      </div>
      <section className="bg-card space-y-2 rounded-xl border p-4">
        <h3 className="font-semibold">首次检查时的失败类型</h3>
        {Object.keys(insights.failure_types).length === 0 ? (
          <p className="text-muted-foreground text-sm">首次检查都通过了。</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {Object.entries(insights.failure_types).map(([k, v]) => (
              <li key={k}>
                {FAILURE_LABELS[k] ?? k}：{v} 次
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="bg-card space-y-2 rounded-xl border p-4">
        <h3 className="font-semibold">建议怎么改</h3>
        {insights.hints.length === 0 ? (
          <p className="text-muted-foreground text-sm">暂时没有需要调整的信号。</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {insights.hints.map((h) => (
              <li key={h.signal}>
                <div className="font-medium">{h.signal}</div>
                <div className="text-muted-foreground">→ {h.suggestion}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
