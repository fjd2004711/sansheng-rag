"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, LayoutDashboard, RotateCcw, ScrollText, Square } from "lucide-react";

import { Spinner } from "@/components/ui";
import { useRun } from "@/hooks/use-orchestration";
import {
  deriveTasks,
  formatDuration,
  gateChecks,
  nodeProgress,
  repairOutcomesByRound,
  timeAgo,
} from "@/lib/orchestration";
import { cn } from "@/lib/utils";
import type { RunMetrics, RunSummary } from "@/types/orchestration";

import { FactCheckResult } from "./fact-check-result";
import { FeedbackButtons } from "./feedback-buttons";
import { FlowCanvas } from "./flow-canvas";
import { NodeInspector } from "./inspector";
import { StatusDot } from "./meta";
import { ReportReader } from "./report-reader";
import { RunDock } from "./run-dock";

const STATUS_TEXT: Record<string, string> = {
  queued: "排队中",
  running: "运行中",
  done: "已完成",
  failed: "失败",
};

function useNow(active: boolean, createdAt: string, lastT: number): number {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return active ? Math.max(lastT, (Date.now() - new Date(createdAt).getTime()) / 1000) : lastT;
}

function Chip({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <span className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-semibold tabular-nums",
          tone === "good" && "text-emerald-600 dark:text-emerald-400",
          tone === "bad" && "text-red-600",
        )}
      >
        {value}
      </span>
    </span>
  );
}

function StatsStrip({
  metrics,
  active,
  now,
  verified,
}: {
  metrics: RunMetrics | null;
  active: boolean;
  now: number;
  verified: (number | undefined)[];
}) {
  const [first, last] = verified;
  return (
    <div className="text-muted-foreground bg-muted/30 flex h-9 items-center gap-5 overflow-x-auto border-t px-4 text-xs">
      {active && !metrics && <Chip label="已用时" value={formatDuration(now)} />}
      {metrics && (
        <>
          <Chip label="总耗时" value={formatDuration(metrics.wall_seconds)} />
          <Chip
            label="任务"
            value={`${metrics.tasks}${metrics.tasks_failed ? `（失败 ${metrics.tasks_failed}）` : ""}`}
            tone={metrics.tasks_failed ? "bad" : undefined}
          />
          <Chip label="并行度" value={`${metrics.parallel_speedup}×`} />
          <Chip label="自循环" value={`${metrics.repair_rounds} 轮`} />
          <Chip label="核查员下调" value={`${metrics.verifier_downgrades} 条`} />
          <Chip
            label="模型调用"
            value={`${metrics.llm_calls} 次 · ${Math.round(metrics.tokens / 1000)}k token`}
          />
          <Chip label="模型" value={metrics.model} />
          {metrics.model_switches.length > 0 && (
            <Chip
              label="模型降级"
              value={metrics.model_switches.map((s) => s.to).join(" → ")}
              tone="bad"
            />
          )}
        </>
      )}
      {first !== undefined && last !== undefined && (
        <Chip
          label="已核实比例"
          value={`${Math.round(first * 100)}% → ${Math.round(last * 100)}%`}
          tone={last >= first ? "good" : "bad"}
        />
      )}
    </div>
  );
}

/** One run: header, workflow canvas with live status, node inspector, bottom dock — or the finished deliverable. */
export function RunView({
  summary,
  onCancel,
  onRerun,
}: {
  summary: RunSummary;
  onCancel: () => void;
  onRerun: () => void;
}) {
  const detail = useRun(summary.id);
  const [view, setView] = useState<"canvas" | "result">("canvas");
  const [selected, setSelected] = useState<string | null>(null);
  const active = summary.status === "queued" || summary.status === "running";

  const events = useMemo(() => detail?.events ?? [], [detail]);
  const tasks = useMemo(() => deriveTasks(events), [events]);
  const graph = detail?.graph ?? null;
  const progress = useMemo(
    () => (graph ? nodeProgress(graph, tasks, events, !active) : undefined),
    [graph, tasks, events, active],
  );
  const checks = useMemo(() => gateChecks(events), [events]);
  const outcomes = useMemo(() => repairOutcomesByRound(events), [events]);
  const lastT = events.at(-1)?.t ?? 0;
  const now = useNow(active, summary.created_at, lastT);
  const metrics = detail?.metrics ?? summary.metrics;
  const result = detail?.result ?? null;
  const node = graph?.nodes.find((n) => n.id === selected) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="bg-card shrink-0 border-b">
        <div className="flex h-14 items-center gap-3 pr-4 pl-12 lg:pl-4">
          <StatusDot status={summary.status} className="h-2.5 w-2.5" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold tracking-tight">{summary.topic}</h2>
            <p className="text-muted-foreground truncate text-xs">
              {summary.spec_name} · {STATUS_TEXT[summary.status]}
              {active && summary.stage ? ` · ${summary.stage}` : ""} · {timeAgo(summary.created_at)}
            </p>
          </div>
          {result && (
            <div className="bg-muted flex shrink-0 rounded-lg p-0.5 text-xs">
              {(
                [
                  ["canvas", "运行过程", LayoutDashboard],
                  ["result", result.kind === "report" ? "报告" : "核查结果", ScrollText],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setView(key)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors",
                    view === key
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          )}
          {summary.status === "done" && <FeedbackButtons runId={summary.id} />}
          {active ? (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("取消这次运行？已经完成的步骤不会保留。")) onCancel();
              }}
              className="text-muted-foreground hover:text-foreground hover:bg-muted flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium"
            >
              <Square className="h-3 w-3" />
              取消运行
            </button>
          ) : (
            <button
              type="button"
              onClick={onRerun}
              className="text-muted-foreground hover:text-foreground hover:bg-muted flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium"
            >
              <RotateCcw className="h-3 w-3" />
              重新运行
            </button>
          )}
        </div>
        <StatsStrip
          metrics={metrics}
          active={active}
          now={now}
          verified={[checks[0]?.metrics.verified_ratio, checks.at(-1)?.metrics.verified_ratio]}
        />
        {active && (
          <div className="bg-muted h-0.5">
            <div
              className="h-full bg-sky-500 transition-all duration-700"
              style={{ width: `${summary.progress}%` }}
            />
          </div>
        )}
      </header>

      {summary.status === "failed" && summary.error && (
        <div className="flex items-start gap-2 border-b border-red-500/30 bg-red-500/8 px-4 py-2.5 text-xs text-red-700 dark:text-red-400">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {summary.error}
        </div>
      )}

      {view === "result" && result ? (
        <div className="min-h-0 flex-1">
          {result.kind === "report" ? (
            <ReportReader
              report={result.report}
              downloadBase={`/api/v1/orchestration/runs/${summary.id}/download`}
            />
          ) : (
            <FactCheckResult result={result} />
          )}
        </div>
      ) : graph ? (
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1">
              <FlowCanvas
                graph={graph}
                progress={progress}
                selected={selected}
                onSelect={setSelected}
              />
              {node && (
                <NodeInspector
                  node={node}
                  graph={graph}
                  tasks={tasks}
                  progress={progress}
                  checks={checks}
                  onClose={() => setSelected(null)}
                />
              )}
            </div>
            <RunDock
              graph={graph}
              tasks={tasks}
              now={now}
              events={events}
              checks={checks}
              outcomes={outcomes}
              selected={selected}
              onSelect={setSelected}
              hasGate={graph.nodes.some((n) => n.kind === "gate")}
            />
          </div>
        </div>
      ) : (
        <div className="text-muted-foreground flex flex-1 items-center justify-center gap-2 text-sm">
          <Spinner />
          加载中…
        </div>
      )}
    </div>
  );
}
