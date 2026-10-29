"use client";

import { useMemo, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";

import { Button, Progress } from "@/components/ui";
import { useRun } from "@/hooks/use-orchestration";
import { apiClient } from "@/lib/api-client";
import { deriveTasks, gateChecks, nodeProgress } from "@/lib/orchestration";
import { getErrorMessage } from "@/lib/utils";
import type { RunMetrics, RunSummary } from "@/types/orchestration";

import { GateChecks } from "./gate-checks";
import { RunResult } from "./run-result";
import { RunTimeline } from "./run-timeline";
import { WorkflowGraph } from "./workflow-graph";

const TAGS = ["口径不对", "数据有误", "建议空泛", "太慢"];

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="bg-muted rounded-md px-2 py-1 text-xs">
      <span className="text-muted-foreground">{label} </span>
      <b>{value}</b>
    </span>
  );
}

function MetricChips({ m }: { m: RunMetrics }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Chip label="总耗时" value={`${Math.round(m.wall_seconds)} 秒`} />
      <Chip label="并行加速" value={`${m.parallel_speedup}×`} />
      <Chip label="任务" value={`${m.tasks}（失败 ${m.tasks_failed}，跳过 ${m.tasks_skipped}）`} />
      <Chip label="自循环轮次" value={String(m.repair_rounds)} />
      <Chip label="核查员下调" value={`${m.verifier_downgrades} 条`} />
      <Chip label="模型调用" value={`${m.llm_calls} 次 / ${m.tokens} token`} />
      <Chip label="模型" value={m.model} />
    </div>
  );
}

export function RunPanel({ summary }: { summary: RunSummary }) {
  const detail = useRun(summary.id);
  const [rated, setRated] = useState<1 | -1 | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const events = useMemo(() => detail?.events ?? [], [detail]);
  const tasks = useMemo(() => deriveTasks(events), [events]);
  const graph = detail?.graph ?? null;
  const progress = useMemo(
    () => (graph ? nodeProgress(graph, tasks, events) : undefined),
    [graph, tasks, events],
  );
  const active = summary.status === "queued" || summary.status === "running";
  const lastT = events.at(-1)?.t ?? 0;
  const now = active
    ? Math.max(lastT, (Date.now() - new Date(summary.created_at).getTime()) / 1000)
    : lastT;
  const metrics = detail?.metrics ?? summary.metrics;
  const fallbacks = events.filter((e) => e.kind === "model_fallback");

  const rate = async (rating: 1 | -1) => {
    setRated(rating);
    try {
      await apiClient.post(`/v1/orchestration/runs/${summary.id}/feedback`, {
        rating,
        tags: rating < 0 ? tags : [],
      });
      toast.success("已记录，谢谢反馈");
    } catch (error) {
      toast.error(getErrorMessage(error, "提交反馈失败"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-card space-y-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">{summary.topic}</h2>
          <span className="text-muted-foreground text-xs">{summary.spec_name}</span>
        </div>
        {active ? (
          <>
            <Progress value={summary.progress} className="h-2" />
            <p className="text-muted-foreground text-sm">
              {summary.stage || "排队中"}（{summary.progress}%）
            </p>
          </>
        ) : summary.status === "failed" ? (
          <p className="text-sm text-red-600">{summary.error || "运行失败"}</p>
        ) : null}
        {metrics && <MetricChips m={metrics} />}
        {fallbacks.length > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            模型自动降级：{fallbacks.map((e) => String(e.detail.to)).join(" → ")}
            （原模型出错，任务已无损重试）
          </p>
        )}
      </div>

      {graph && <WorkflowGraph graph={graph} progress={progress} />}

      <section className="bg-card space-y-2 rounded-xl border p-4">
        <h3 className="font-semibold">调度时间线</h3>
        <RunTimeline tasks={tasks} now={now} />
      </section>

      <section className="bg-card space-y-2 rounded-xl border p-4">
        <h3 className="font-semibold">质量门与自循环</h3>
        <GateChecks checks={gateChecks(events)} repairs={metrics?.repairs ?? []} />
      </section>

      {detail?.result && <RunResult id={summary.id} result={detail.result} />}

      {summary.status === "done" && (
        <div className="bg-card flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm">
          <span>这次结果有帮助吗？</span>
          <Button
            size="sm"
            variant={rated === 1 ? "default" : "outline"}
            onClick={() => void rate(1)}
          >
            <ThumbsUp className="mr-1 h-4 w-4" />
            有帮助
          </Button>
          <Button
            size="sm"
            variant={rated === -1 ? "default" : "outline"}
            onClick={() => void rate(-1)}
          >
            <ThumbsDown className="mr-1 h-4 w-4" />
            没帮助
          </Button>
          {TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() =>
                setTags((cur) => (cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag]))
              }
              className={`rounded-full border px-2 py-0.5 text-xs ${tags.includes(tag) ? "bg-primary text-primary-foreground" : ""}`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
