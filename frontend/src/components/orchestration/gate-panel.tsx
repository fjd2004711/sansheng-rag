"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ShieldAlert } from "lucide-react";

import type { GateCheck, RepairOutcome } from "@/lib/orchestration";
import { cn } from "@/lib/utils";

const pct = (v: number | undefined) => (v === undefined ? "—" : `${Math.round(v * 100)}%`);

function Meter({
  label,
  value,
  threshold,
  ok,
}: {
  label: string;
  value: number | undefined;
  threshold?: number;
  ok: boolean;
}) {
  return (
    <div className="bg-muted/40 rounded-lg border p-3">
      <div className="text-muted-foreground text-[11px]">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-xl font-semibold tabular-nums",
          ok ? "text-foreground" : "text-amber-600 dark:text-amber-400",
        )}
      >
        {pct(value)}
      </div>
      <div className="bg-border relative mt-2 h-1.5 rounded-full">
        <div
          className={cn("h-full rounded-full", ok ? "bg-emerald-500" : "bg-amber-500")}
          style={{ width: `${Math.min(100, (value ?? 0) * 100)}%` }}
        />
        {threshold !== undefined && (
          <span
            className="bg-foreground absolute -top-0.5 h-2.5 w-0.5 rounded"
            style={{ left: `${threshold * 100}%` }}
            title={`门槛 ${pct(threshold)}`}
          />
        )}
      </div>
      {threshold !== undefined && (
        <div className="text-muted-foreground mt-1 text-[10px]">门槛 {pct(threshold)}</div>
      )}
    </div>
  );
}

function Count({ label, value }: { label: string; value: number | undefined }) {
  const bad = (value ?? 0) > 0;
  return (
    <div className="bg-muted/40 rounded-lg border p-3">
      <div className="text-muted-foreground text-[11px]">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-xl font-semibold tabular-nums",
          bad && "text-amber-600 dark:text-amber-400",
        )}
      >
        {value === undefined ? "—" : Math.round(value)}
      </div>
    </div>
  );
}

/** The quality gate over time: one pill per check, then what the verifier measured, why it failed, what was repaired. */
export function GatePanel({
  checks,
  outcomes,
  gate,
  stalled,
  skippedBudget,
}: {
  checks: GateCheck[];
  outcomes: Record<number, RepairOutcome[]>;
  gate: Record<string, number | boolean> | null;
  stalled: boolean;
  skippedBudget: boolean;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => setPicked(null), [checks.length]);
  const index = Math.min(picked ?? checks.length - 1, checks.length - 1);
  const check = checks[index];
  if (!check) return <p className="text-muted-foreground p-6 text-sm">质量门还没有检查。</p>;
  const minRatio =
    typeof gate?.min_verified_ratio === "number" ? gate.min_verified_ratio : undefined;
  const minAuth =
    typeof gate?.min_authoritative_sections === "number"
      ? gate.min_authoritative_sections
      : undefined;
  const bySection = check.failures.reduce<Record<string, GateCheck["failures"]>>((acc, f) => {
    (acc[f.section] ??= []).push(f);
    return acc;
  }, {});
  const repairs = outcomes[check.round + 1] ?? [];

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {checks.map((c, i) => (
          <button
            key={c.round}
            type="button"
            onClick={() => setPicked(i)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-xs transition-colors",
              i === index ? "border-brand bg-brand/8" : "hover:bg-muted",
            )}
          >
            {c.passed ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-amber-600" />
            )}
            <span>
              <span className="block font-medium">
                {c.round === 0 ? "首次检查" : `修复后复查 ${c.round}`}
              </span>
              <span className="text-muted-foreground tabular-nums">
                已核实 {pct(c.metrics.verified_ratio)}
              </span>
            </span>
          </button>
        ))}
        {stalled && (
          <span className="text-xs text-amber-700 dark:text-amber-400">
            修复一轮没有进展，已停止
          </span>
        )}
        {skippedBudget && (
          <span className="text-xs text-amber-700 dark:text-amber-400">
            预算已用掉大半，未再修复
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Meter
          label="已核实的说法"
          value={check.metrics.verified_ratio}
          threshold={minRatio}
          ok={minRatio === undefined || (check.metrics.verified_ratio ?? 0) >= minRatio}
        />
        <Meter
          label="有权威来源支持的章节"
          value={check.metrics.authoritative_sections}
          threshold={minAuth}
          ok={minAuth === undefined || (check.metrics.authoritative_sections ?? 0) >= minAuth}
        />
        <Count label="来源里找不到的数字" value={check.metrics.unsupported_numbers} />
        <Count label="范围错置的章节" value={check.metrics.scope_issues} />
      </div>

      {check.reasons.length > 0 && (
        <ul className="space-y-1 text-xs">
          {check.reasons.map((r) => (
            <li key={r} className="flex gap-2">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              {r}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {Object.keys(bySection).length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold">失败项（按章节）</h4>
            {Object.entries(bySection).map(([section, list]) => (
              <div key={section} className="bg-muted/30 rounded-lg border p-2.5 text-xs">
                <div className="font-medium">{section}</div>
                <ul className="text-muted-foreground mt-1 space-y-0.5">
                  {list.map((f, i) => (
                    <li key={i}>
                      · {f.label}
                      {f.detail ? `（${f.detail}）` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {repairs.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold">这一轮修复的结果（重写只有不比原稿差才采用）</h4>
            {repairs.map((o, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border p-2.5 text-xs">
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                    o.accepted
                      ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"
                      : "bg-amber-500/14 text-amber-700 dark:text-amber-400",
                  )}
                >
                  {o.accepted ? "采用" : "放弃"}
                </span>
                <span className="min-w-0 flex-1 truncate">{o.section}</span>
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  {pct(o.before)} → {pct(o.after)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
