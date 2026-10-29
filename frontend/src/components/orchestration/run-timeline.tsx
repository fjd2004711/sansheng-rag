"use client";

import { useMemo } from "react";

import type { TaskRow } from "@/lib/orchestration";
import { cn } from "@/lib/utils";

const POOL_COLOR: Record<string, string> = {
  llm: "bg-sky-500",
  search: "bg-emerald-500",
  none: "bg-slate-400",
};

/** A Gantt chart of the run: bars that overlap in time are tasks the scheduler ran in parallel. */
export function RunTimeline({ tasks, now }: { tasks: TaskRow[]; now: number }) {
  const horizon = useMemo(
    () => Math.max(now, ...tasks.map((t) => t.end ?? t.start), 1),
    [tasks, now],
  );
  const ticks = useMemo(() => {
    const step = horizon > 600 ? 120 : horizon > 240 ? 60 : horizon > 90 ? 30 : 10;
    return Array.from({ length: Math.floor(horizon / step) + 1 }, (_, i) => i * step);
  }, [horizon]);

  if (tasks.length === 0) return <p className="text-muted-foreground text-sm">还没有任务开始。</p>;
  return (
    <div className="space-y-1">
      <div className="text-muted-foreground relative ml-[170px] h-4 text-[10px]">
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute -translate-x-1/2"
            style={{ left: `${(t / horizon) * 100}%` }}
          >
            {t}s
          </span>
        ))}
      </div>
      <div className="max-h-[360px] space-y-0.5 overflow-y-auto pr-1">
        {tasks.map((task) => {
          const end = task.end ?? now;
          const left = (task.start / horizon) * 100;
          const width = Math.max(((end - task.start) / horizon) * 100, 0.6);
          const color =
            task.status === "failed"
              ? "bg-red-500"
              : task.status === "skipped"
                ? "bg-slate-300 dark:bg-slate-600"
                : (POOL_COLOR[task.pool] ?? POOL_COLOR.none);
          return (
            <div key={task.id} className="flex items-center gap-2 text-[11px]">
              <span
                className="w-[162px] shrink-0 truncate text-right"
                title={`${task.id} · ${task.label}`}
              >
                {task.label}
              </span>
              <div className="bg-muted/40 relative h-4 flex-1 rounded">
                <div
                  className={cn(
                    "absolute top-0 h-4 rounded",
                    color,
                    task.status === "running" && "animate-pulse",
                  )}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${task.id}\n${task.start.toFixed(1)}s → ${task.end === null ? "运行中" : `${task.end.toFixed(1)}s`}${task.note ? `\n${task.note}` : ""}`}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-muted-foreground flex flex-wrap gap-3 pt-1 text-[10px]">
        <Legend color="bg-sky-500" text="模型任务" />
        <Legend color="bg-emerald-500" text="搜索任务" />
        <Legend color="bg-slate-400" text="其他" />
        <Legend color="bg-red-500" text="失败" />
        <Legend color="bg-slate-300" text="被跳过" />
      </div>
    </div>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn("inline-block h-2 w-3 rounded-sm", color)} />
      {text}
    </span>
  );
}
