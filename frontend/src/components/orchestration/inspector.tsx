"use client";

import { X } from "lucide-react";

import {
  formatDuration,
  tasksByNode,
  type GateCheck,
  type NodeProgress,
  type TaskRow,
} from "@/lib/orchestration";
import { cn } from "@/lib/utils";
import type { GraphNode, SpecGraph } from "@/types/orchestration";

import { KIND_META, KindIcon, STATUS_META, StatusIcon } from "./meta";

const pct = (v: number) => `${Math.round(v * 100)}%`;

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-xs">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{value}</dd>
    </div>
  );
}

function NodeDetail({
  node,
  graph,
  tasks,
  progress,
  checks,
  onClose,
}: {
  node: GraphNode;
  graph: SpecGraph;
  tasks: TaskRow[];
  progress?: NodeProgress;
  checks: GateCheck[];
  onClose: () => void;
}) {
  const agent = graph.agents.find((a) => a.name === node.agent);
  const mine = tasksByNode(tasks)[node.id] ?? [];
  const status = progress?.status ?? "pending";
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start gap-3">
        <KindIcon kind={node.kind} className="h-9 w-9" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{node.id}</h3>
          <p className="text-muted-foreground text-xs">{KIND_META[node.kind].label}节点</p>
        </div>
        <button
          type="button"
          aria-label="关闭"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
          STATUS_META[status].text,
        )}
      >
        <StatusIcon status={status} />
        <span className="font-medium">{STATUS_META[status].label}</span>
        {progress && progress.total > 0 && (
          <span className="text-muted-foreground ml-auto tabular-nums">
            {progress.done} / {progress.total} 个任务
          </span>
        )}
      </div>
      <dl className="divide-y rounded-lg border px-3">
        <Row label="角色" value={node.role || "—"} />
        <Row
          label="技能"
          value={<code className="bg-muted rounded px-1 text-[11px]">{node.skill || "—"}</code>}
        />
        <Row label="模型档位" value={agent ? (agent.model_tier === "fast" ? "轻量" : "强") : "—"} />
        <Row
          label="使用模型"
          value={
            agent?.model ? (
              <code className="bg-muted rounded px-1 text-[11px]">{agent.model}</code>
            ) : typeof graph.policy.model === "string" && graph.policy.model ? (
              <span>
                <code className="bg-muted rounded px-1 text-[11px]">{graph.policy.model}</code>（统一）
              </span>
            ) : (
              "系统默认"
            )
          }
        />
        <Row
          label="资源池"
          value={node.pool === "none" ? "无" : node.pool === "search" ? "搜索" : "模型"}
        />
        <Row
          label="必要性"
          value={node.essential ? "必要（失败则运行失败）" : "可取消（预算不足时跳过）"}
        />
        {node.independent && <Row label="独立性" value="看不到撰稿推理，自己重新检索" />}
        {node.kind === "loop" && <Row label="最多轮次" value={node.max_rounds} />}
      </dl>
      {node.gate && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold">放行条件</h4>
          <ul className="space-y-1 rounded-lg border p-3 text-xs">
            {typeof node.gate.min_verified_ratio === "number" && (
              <li>已核实比例 ≥ {pct(node.gate.min_verified_ratio)}</li>
            )}
            {typeof node.gate.min_authoritative_sections === "number" && (
              <li>权威来源覆盖章节 ≥ {pct(node.gate.min_authoritative_sections)}</li>
            )}
            {typeof node.gate.max_unsupported_numbers === "number" && (
              <li>来源里找不到的数字 ≤ {node.gate.max_unsupported_numbers}</li>
            )}
            {node.gate.require_scope_disclosed && <li>单校/单地区数据必须声明“不代表整体”</li>}
            {node.on_fail && (
              <li className="text-muted-foreground">
                不达标 → 触发 {node.on_fail}（最多 {node.max_rounds} 轮）
              </li>
            )}
          </ul>
          {checks.length > 0 && (
            <p className="text-muted-foreground text-[11px]">
              共检查 {checks.length} 次，最后一次{checks.at(-1)?.passed ? "通过" : "未通过"}。
            </p>
          )}
        </div>
      )}
      {mine.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold">任务（{mine.length}）</h4>
          <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border">
            {mine.map((t) => (
              <li key={t.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                <StatusIcon status={t.status} className="h-3.5 w-3.5" />
                <span className="min-w-0 flex-1 truncate" title={t.label}>
                  {t.label}
                </span>
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  {t.end === null ? "…" : formatDuration(t.end - t.start)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Node details, floating over the canvas when a node is clicked (n8n / Dify style). */
export function NodeInspector({
  node,
  graph,
  tasks,
  progress,
  checks,
  onClose,
}: {
  node: GraphNode;
  graph: SpecGraph;
  tasks: TaskRow[];
  progress: Record<string, NodeProgress> | undefined;
  checks: GateCheck[];
  onClose: () => void;
}) {
  return (
    <aside className="bg-card absolute top-3 right-3 bottom-3 z-10 w-[320px] overflow-y-auto rounded-xl border shadow-xl">
      <NodeDetail
        node={node}
        graph={graph}
        tasks={tasks}
        progress={progress?.[node.id]}
        checks={checks}
        onClose={onClose}
      />
    </aside>
  );
}
