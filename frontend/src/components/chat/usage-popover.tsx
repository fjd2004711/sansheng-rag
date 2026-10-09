"use client";

import { useState } from "react";
import { Coins } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui";
import { apiClient } from "@/lib/api-client";
import { formatTokens } from "@/lib/format-tokens";

interface Totals {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  turns: number;
}
interface Summary {
  days: number;
  totals: Totals;
  today: Totals;
  by_day: Array<{ day: string; total_tokens: number }>;
  by_source: Array<{ source: "server" | "custom"; model: string; total_tokens: number }>;
}

/** The signed-in user's own token usage; loaded when opened so it is always current. */
export function UsagePopover() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [failed, setFailed] = useState(false);

  const load = (open: boolean) => {
    if (!open) return;
    setFailed(false);
    apiClient.get<Summary>("/v1/usage/me", { params: { days: "30" } }).then(setSummary).catch(() => setFailed(true));
  };

  const peak = Math.max(1, ...(summary?.by_day.map((d) => d.total_tokens) ?? [1]));

  return (
    <Popover onOpenChange={load}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground hover:bg-foreground/5 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-colors"
        >
          <Coins className="h-3.5 w-3.5" />
          用量
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold">我的 Token 用量</p>
          <p className="text-muted-foreground mt-0.5 text-xs">只统计你自己的提问（含资料评审、核对、追问建议）。</p>
        </div>
        {failed && <p className="text-destructive px-4 py-4 text-xs">读取失败，请稍后再试</p>}
        {!summary && !failed && <p className="text-muted-foreground px-4 py-4 text-xs">读取中…</p>}
        {summary && (
          <div className="space-y-3 px-4 py-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="今天" value={formatTokens(summary.today.total_tokens)} />
              <Stat label={`近 ${summary.days} 天`} value={formatTokens(summary.totals.total_tokens)} />
            </div>
            <p className="text-muted-foreground text-xs">
              近 {summary.days} 天共 {summary.totals.turns} 次提问：输入 {formatTokens(summary.totals.prompt_tokens)} · 输出{" "}
              {formatTokens(summary.totals.completion_tokens)}
            </p>
            {summary.by_day.length > 0 && (
              <div className="flex h-14 items-end gap-0.5" aria-label="每日用量">
                {summary.by_day.slice(-30).map((d) => (
                  <span
                    key={d.day}
                    title={`${d.day}：${d.total_tokens.toLocaleString()} tokens`}
                    className="bg-primary/60 min-w-[3px] flex-1 rounded-t"
                    style={{ height: `${Math.max(6, (d.total_tokens / peak) * 100)}%` }}
                  />
                ))}
              </div>
            )}
            <ul className="space-y-1 text-xs">
              {summary.by_source.map((row) => (
                <li key={`${row.source}-${row.model}`} className="flex justify-between gap-2">
                  <span className="truncate" title={row.model}>
                    {row.source === "custom" ? "我的模型" : "系统模型"} · {row.model}
                  </span>
                  <span className="text-muted-foreground shrink-0">{formatTokens(row.total_tokens)}</span>
                </li>
              ))}
              {summary.by_source.length === 0 && <li className="text-muted-foreground">还没有用量记录</li>}
            </ul>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/50 rounded-lg px-3 py-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
