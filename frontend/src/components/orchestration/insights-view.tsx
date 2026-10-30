"use client";

import { Lightbulb, TrendingUp } from "lucide-react";

import { useInsights } from "@/hooks/use-orchestration";

const FAILURE_LABELS: Record<string, string> = {
  weak_evidence: "证据不足",
  no_authority: "缺权威来源",
  unsupported_number: "数字对不上原文",
  scope_misplaced: "范围错置",
};

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card rounded-xl border p-4 shadow-sm">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {sub && <div className="text-muted-foreground mt-1 text-[11px]">{sub}</div>}
    </div>
  );
}

/** What recent runs, gate checks and reader feedback say should change (applied by a person, gated by evals). */
export function InsightsView({ refreshKey }: { refreshKey: unknown }) {
  const insights = useInsights(refreshKey);
  if (!insights) return <p className="text-muted-foreground p-8 text-sm">加载中…</p>;
  if (insights.runs === 0) {
    return (
      <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-sm">
        <Lightbulb className="h-8 w-8 opacity-40" />
        还没有完成的运行，跑一次再来看。
      </div>
    );
  }
  const avg = insights.averages;
  const failures = Object.entries(insights.failure_types).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...failures.map(([, n]) => n));
  const gain = insights.verified_gain;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        <header>
          <h1 className="text-xl font-semibold tracking-tight">改进建议</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            基于最近 {insights.runs}{" "}
            次完成的运行。这些只是提示：改提示词或策略之后，必须在金标集上指标不退步才能发布。
          </p>
        </header>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile
            label="平均耗时"
            value={avg.wall_seconds !== undefined ? `${Math.round(avg.wall_seconds)} 秒` : "—"}
          />
          <Tile
            label="平均并行度"
            value={avg.parallel_speedup !== undefined ? `${avg.parallel_speedup}×` : "—"}
            sub="忙碌时间 ÷ 总耗时"
          />
          <Tile
            label="自循环平均提升"
            value={
              gain === null ? "—" : `${gain >= 0 ? "+" : ""}${Math.round(gain * 100)} 个百分点`
            }
            sub="已核实比例，修复前后"
          />
          <Tile
            label="平均核查员下调"
            value={avg.verifier_downgrades !== undefined ? `${avg.verifier_downgrades} 条` : "—"}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="bg-card rounded-xl border p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="h-4 w-4" />
              首次检查时的失败类型
            </h2>
            {failures.length === 0 ? (
              <p className="text-muted-foreground mt-3 text-sm">首次检查都通过了。</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {failures.map(([k, n]) => (
                  <li key={k}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span>{FAILURE_LABELS[k] ?? k}</span>
                      <span className="text-muted-foreground tabular-nums">{n} 次</span>
                    </div>
                    <div className="bg-muted h-2 overflow-hidden rounded-full">
                      <div
                        className="h-full rounded-full bg-amber-500"
                        style={{ width: `${(n / max) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="bg-card rounded-xl border p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Lightbulb className="h-4 w-4" />
              建议怎么改
            </h2>
            {insights.hints.length === 0 ? (
              <p className="text-muted-foreground mt-3 text-sm">暂时没有需要调整的信号。</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {insights.hints.map((h) => (
                  <li key={h.signal} className="rounded-lg border p-3 text-xs">
                    <div className="font-medium">{h.signal}</div>
                    <div className="text-muted-foreground mt-1 leading-relaxed">
                      → {h.suggestion}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <p className="text-muted-foreground text-xs">
          用户反馈：好评 {insights.ratings.helpful ?? 0} · 差评 {insights.ratings.not_helpful ?? 0}
        </p>
      </div>
    </div>
  );
}
