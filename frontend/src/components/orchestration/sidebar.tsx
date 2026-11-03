"use client";

import { Lightbulb, Play, Plus, Trash2, Workflow } from "lucide-react";

import { formatDuration, timeAgo } from "@/lib/orchestration";
import { cn } from "@/lib/utils";
import type { RunSummary, Spec } from "@/types/orchestration";

import { PageTitle } from "@/components/layout";

import { StatusDot } from "./meta";

export type Tab = "runs" | "specs" | "insights";

const NAV: [Tab, string, typeof Play][] = [
  ["runs", "运行", Play],
  ["specs", "工作流定义", Workflow],
  ["insights", "改进建议", Lightbulb],
];

/** Left rail (Linear / Dify style): primary action, section switcher, then the list for the current section. */
export function Sidebar({
  tab,
  onTab,
  runs,
  specs,
  selectedRun,
  selectedSpec,
  onSelectRun,
  onSelectSpec,
  onDeleteRun,
  onNewRun,
}: {
  tab: Tab;
  onTab: (tab: Tab) => void;
  runs: RunSummary[];
  specs: Spec[];
  selectedRun: string | null;
  selectedSpec: string | null;
  onSelectRun: (id: string) => void;
  onSelectSpec: (name: string) => void;
  onDeleteRun: (id: string) => void;
  onNewRun: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-4 px-4 pt-5 pb-3">
        <PageTitle juan="卷四" title="编排平台" />
        <button
          type="button"
          onClick={onNewRun}
          className="bg-foreground text-background flex w-full items-center justify-center gap-2 rounded-sm py-2 text-sm font-medium tracking-wide transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          新建运行
        </button>
        <nav className="border-foreground/40 divide-foreground/12 divide-y border-t-[3px] border-double" aria-label="平台分区">
          {NAV.map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => onTab(key)}
              aria-current={tab === key ? "page" : undefined}
              className={cn(
                "flex w-full items-center gap-2.5 px-1 py-2.5 text-sm transition-colors",
                tab === key
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className={cn("h-4 w-4", tab === key && "text-brand")} />
              {label}
              {key === "runs" && runs.length > 0 && (
                <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                  {runs.length}
                </span>
              )}
              {key === "specs" && specs.length > 0 && (
                <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                  {specs.length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {tab === "runs" && (
          <>
            <p className="font-kai text-muted-foreground px-2 pt-1 pb-2 text-sm tracking-[0.15em]">
              历史运行
            </p>
            {runs.length === 0 && (
              <p className="text-muted-foreground px-2 text-xs">
                还没有运行。点上方“新建运行”开始。
              </p>
            )}
            <ul className="space-y-0.5">
              {runs.map((run) => (
                <li key={run.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onSelectRun(run.id)}
                    className={cn(
                      "w-full rounded-sm px-2.5 py-2 text-left transition-colors",
                      run.id === selectedRun ? "bg-accent" : "hover:bg-accent/60",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <StatusDot status={run.status} className="mt-1.5" />
                      <div className="min-w-0 flex-1">
                        <p className="font-display line-clamp-2 text-[14px] leading-snug font-bold">
                          {run.topic}
                        </p>
                        <p className="text-muted-foreground mt-0.5 truncate text-[11px]">
                          {run.spec_name} ·{" "}
                          {run.status === "running"
                            ? `运行中 ${run.progress}%`
                            : run.status === "failed"
                              ? "失败"
                              : run.metrics
                                ? formatDuration(run.metrics.wall_seconds)
                                : "已完成"}{" "}
                          · {timeAgo(run.created_at)}
                        </p>
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label="删除运行"
                    onClick={() => onDeleteRun(run.id)}
                    className="text-muted-foreground absolute top-2 right-2 hidden rounded p-1 group-hover:block hover:bg-red-500/10 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {tab === "specs" && (
          <>
            <p className="text-muted-foreground px-2 pt-1 pb-2 text-[11px] font-medium tracking-wide">
              工作流
            </p>
            <ul className="space-y-0.5">
              {specs.map((spec) => (
                <li key={spec.name}>
                  <button
                    type="button"
                    onClick={() => onSelectSpec(spec.name)}
                    className={cn(
                      "w-full rounded-lg px-2.5 py-2 text-left transition-colors",
                      spec.name === selectedSpec ? "bg-foreground/8" : "hover:bg-foreground/5",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium">{spec.name}</span>
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-[10px]",
                          spec.builtin
                            ? "bg-muted text-muted-foreground"
                            : "bg-brand/12 text-brand",
                        )}
                      >
                        {spec.builtin ? "内置" : "我的"}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-0.5 line-clamp-2 text-[11px] leading-snug">
                      {spec.description}
                    </p>
                    <p className="text-muted-foreground mt-1 text-[10px]">
                      {spec.graph.nodes.length} 个节点 · {spec.graph.agents.length} 个智能体
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {tab === "insights" && (
          <p className="text-muted-foreground px-2 py-2 text-xs leading-relaxed">
            汇总最近完成的运行：失败类型、自循环的效果、用户反馈，并给出怎么改的提示。
          </p>
        )}
      </div>
    </div>
  );
}
