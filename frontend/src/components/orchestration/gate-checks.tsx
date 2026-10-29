"use client";

import { CheckCircle2, ShieldAlert } from "lucide-react";

import type { GateCheck } from "@/lib/orchestration";
import { cn } from "@/lib/utils";

const METRIC_LABELS: Record<string, string> = {
  verified_ratio: "已核实比例",
  authoritative_sections: "权威来源覆盖章节",
  unsupported_numbers: "来源里找不到的数字",
  scope_issues: "范围错置章节",
};

const pct = (v: number) => `${Math.round(v * 100)}%`;
const show = (key: string, v: number) =>
  key.endsWith("ratio") || key.endsWith("sections") ? pct(v) : String(v);

/** Each gate check of the run: what the independent verifier measured, why it failed, what was repaired. */
export function GateChecks({
  checks,
  repairs,
}: {
  checks: GateCheck[];
  repairs: { round: number; sections: string[]; types: string[] }[];
}) {
  if (checks.length === 0)
    return <p className="text-muted-foreground text-sm">质量门还没有检查。</p>;
  return (
    <ol className="space-y-2">
      {checks.map((check) => {
        const repair = repairs.find((r) => r.round === check.round + 1);
        return (
          <li
            key={check.round}
            className={cn(
              "rounded-lg border p-3 text-sm",
              check.passed
                ? "border-emerald-500/50 bg-emerald-500/5"
                : "border-amber-500/50 bg-amber-500/5",
            )}
          >
            <div className="flex flex-wrap items-center gap-2 font-medium">
              {check.passed ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-amber-600" />
              )}
              {check.round === 0 ? "首次检查" : `修复后第 ${check.round} 次复查`}：
              {check.passed ? "通过" : "未通过"}
              <span className="text-muted-foreground flex flex-wrap gap-x-3 text-xs font-normal">
                {Object.entries(check.metrics)
                  .filter(([k]) => k in METRIC_LABELS)
                  .map(([k, v]) => (
                    <span key={k}>
                      {METRIC_LABELS[k]} {show(k, v)}
                    </span>
                  ))}
              </span>
            </div>
            {check.reasons.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-xs">
                {check.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            {check.failures.length > 0 && (
              <div className="mt-2 space-y-0.5 text-xs">
                {check.failures.map((f, i) => (
                  <div key={i}>
                    <span className="font-medium">{f.section}</span>：{f.label}
                    {f.detail ? (
                      <span className="text-muted-foreground">（{f.detail}）</span>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            {repair && (
              <p className="mt-2 text-xs text-sky-700 dark:text-sky-400">
                → 自循环第 {repair.round} 轮：按失败类型补检索并重写「{repair.sections.join("、")}
                」，再复核
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
