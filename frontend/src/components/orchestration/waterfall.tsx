"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { formatDuration, tasksByNode, type TaskRow } from "@/lib/orchestration";
import { cn } from "@/lib/utils";
import type { SpecGraph } from "@/types/orchestration";

import { KindIcon, StatusIcon } from "./meta";

const POOL_BAR: Record<string, string> = {
  llm: "bg-sky-500",
  search: "bg-emerald-500",
  none: "bg-slate-400",
};

/** A trace waterfall (LangSmith style): tasks grouped by workflow node; bars that overlap ran in parallel. */
export function Waterfall({
  tasks,
  graph,
  now,
  selected,
  onSelect,
}: {
  tasks: TaskRow[];
  graph: SpecGraph;
  now: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const horizon = useMemo(
    () => Math.max(now, ...tasks.map((t) => t.end ?? t.start), 1),
    [tasks, now],
  );
  const ticks = useMemo(() => {
    const step =
      horizon > 900 ? 180 : horizon > 400 ? 120 : horizon > 200 ? 60 : horizon > 80 ? 30 : 10;
    return Array.from({ length: Math.floor(horizon / step) + 1 }, (_, i) => i * step);
  }, [horizon]);
  const grouped = useMemo(() => tasksByNode(tasks), [tasks]);
  const nodes = graph.nodes.filter((n) => grouped[n.id]?.length);

  if (nodes.length === 0)
    return <p className="text-muted-foreground p-6 text-sm">还没有任务开始。</p>;

  const toggle = (id: string) =>
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div className="min-w-[640px] text-xs">
      <div className="bg-card/95 sticky top-0 z-10 flex border-b backdrop-blur">
        <div className="w-[260px] shrink-0 px-3 py-1.5 font-medium">节点 / 任务</div>
        <div className="relative h-7 flex-1">
          {ticks.map((t) => (
            <span
              key={t}
              className="text-muted-foreground absolute top-1.5 -translate-x-1/2 text-[10px] tabular-nums"
              style={{ left: `${(t / horizon) * 100}%` }}
            >
              {t}s
            </span>
          ))}
        </div>
      </div>
      {nodes.map((node) => {
        const rows = grouped[node.id] ?? [];
        const start = Math.min(...rows.map((r) => r.start));
        const end = Math.max(...rows.map((r) => r.end ?? now));
        const open = !collapsed.has(node.id);
        const running = rows.some((r) => r.status === "running");
        return (
          <div key={node.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => onSelect(node.id)}
              onKeyDown={(e) => e.key === "Enter" && onSelect(node.id)}
              className={cn(
                "hover:bg-muted/60 flex cursor-pointer items-center border-b",
                selected === node.id && "bg-brand/8",
              )}
            >
              <div className="flex w-[260px] shrink-0 items-center gap-1.5 px-2 py-1.5">
                <button
                  type="button"
                  aria-label={open ? "收起" : "展开"}
                  className="text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(node.id);
                  }}
                >
                  {open ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>
                <KindIcon kind={node.kind} className="h-5 w-5 rounded-md [&_svg]:h-3 [&_svg]:w-3" />
                <span className="truncate font-medium">{node.id}</span>
                <span className="text-muted-foreground ml-auto shrink-0 tabular-nums">
                  {rows.length > 1 ? `${rows.length} · ` : ""}
                  {formatDuration(end - start)}
                </span>
              </div>
              <div className="relative h-5 flex-1">
                <div
                  className={cn(
                    "absolute top-1.5 h-2 rounded-full opacity-35",
                    running ? "bg-sky-500" : "bg-foreground",
                  )}
                  style={{
                    left: `${(start / horizon) * 100}%`,
                    width: `${Math.max(((end - start) / horizon) * 100, 0.6)}%`,
                  }}
                />
              </div>
            </div>
            {open &&
              rows.map((task) => {
                const e = task.end ?? now;
                const left = (task.start / horizon) * 100;
                const width = Math.max(((e - task.start) / horizon) * 100, 0.5);
                const color =
                  task.status === "failed"
                    ? "bg-red-500"
                    : task.status === "skipped"
                      ? "bg-slate-300 dark:bg-slate-600"
                      : (POOL_BAR[task.pool] ?? POOL_BAR.none);
                return (
                  <div
                    key={task.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(node.id)}
                    onKeyDown={(ev) => ev.key === "Enter" && onSelect(node.id)}
                    className="hover:bg-muted/40 group flex cursor-pointer items-center"
                    title={`${task.id}\n${task.start.toFixed(1)}s → ${task.end === null ? "运行中" : `${task.end.toFixed(1)}s`}${task.note ? `\n${task.note}` : ""}`}
                  >
                    <div className="flex w-[260px] shrink-0 items-center gap-1.5 py-1 pr-2 pl-9">
                      <StatusIcon status={task.status} className="h-3 w-3" />
                      <span className="text-muted-foreground group-hover:text-foreground truncate">
                        {task.label}
                      </span>
                    </div>
                    <div className="relative h-6 flex-1">
                      {ticks.map((t) => (
                        <span
                          key={t}
                          className="bg-border/60 absolute top-0 h-full w-px"
                          style={{ left: `${(t / horizon) * 100}%` }}
                        />
                      ))}
                      <div
                        className={cn(
                          "absolute top-1.5 h-3 rounded-sm",
                          color,
                          task.status === "running" && "animate-pulse",
                        )}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      />
                      <span
                        className="text-muted-foreground absolute top-1 text-[10px] tabular-nums"
                        style={{ left: `calc(${left + width}% + 4px)` }}
                      >
                        {formatDuration(e - task.start)}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        );
      })}
      <div className="text-muted-foreground flex flex-wrap gap-4 px-3 py-2 text-[10px]">
        {[
          ["bg-sky-500", "模型任务"],
          ["bg-emerald-500", "搜索任务"],
          ["bg-slate-400", "其他"],
          ["bg-red-500", "失败"],
          ["bg-slate-300", "被跳过"],
        ].map(([c, t]) => (
          <span key={t} className="flex items-center gap-1">
            <span className={cn("inline-block h-2 w-3 rounded-sm", c)} />
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
