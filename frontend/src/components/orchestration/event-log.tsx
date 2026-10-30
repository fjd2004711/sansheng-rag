"use client";

import { useMemo, useState } from "react";

import { describeEvent, type EventTone } from "@/lib/orchestration";
import { cn } from "@/lib/utils";
import type { RunEvent } from "@/types/orchestration";

const FILTERS = [
  ["all", "全部"],
  ["task", "任务"],
  ["gate", "质量门"],
  ["repair", "修复"],
  ["system", "系统"],
] as const;

const TONE: Record<EventTone, string> = {
  info: "bg-muted-foreground/50",
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-red-500",
};

/** The raw event log in plain Chinese; every row comes from a structured event, nothing is parsed from text. */
export function EventLog({ events }: { events: RunEvent[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const lines = useMemo(() => events.map(describeEvent), [events]);
  const shown = lines.filter((l) => filter === "all" || l.group === filter);
  return (
    <div className="text-xs">
      <div className="bg-card/95 sticky top-0 z-10 flex items-center gap-1 border-b px-3 py-2 backdrop-blur">
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "rounded-md px-2 py-1 transition-colors",
              filter === key
                ? "bg-foreground/8 text-foreground font-medium"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {label}
          </button>
        ))}
        <span className="text-muted-foreground ml-auto tabular-nums">{shown.length} 条</span>
      </div>
      <ul className="divide-border/60 divide-y font-mono">
        {shown.map((l) => (
          <li key={l.seq} className="hover:bg-muted/40 flex items-start gap-3 px-3 py-1.5">
            <span className="text-muted-foreground w-12 shrink-0 text-right tabular-nums">
              {l.t.toFixed(1)}s
            </span>
            <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", TONE[l.tone])} />
            <span className="font-sans">{l.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
