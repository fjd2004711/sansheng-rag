"use client";

import { Background, Controls, Handle, Position, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Activity, Check, CircleAlert, Search, ShieldCheck, WandSparkles } from "lucide-react";
import type { AgentTraceEvent } from "@/types";
import { cn } from "@/lib/utils";
import { TRACE_FAILURE_LABELS, TRACE_STATUS_LABELS, TRACE_STEP_LABELS } from "@/lib/agent-trace-labels";

const LABELS = TRACE_STEP_LABELS;
const STATUS_LABELS = TRACE_STATUS_LABELS;
const FAILURE_LABELS = TRACE_FAILURE_LABELS;

function iconFor(step: string) {
  if (step.includes("retriev")) return Search;
  if (step.includes("rewrite") || step.includes("regenerat")) return WandSparkles;
  if (step.includes("verify") || step.includes("evaluate")) return ShieldCheck;
  return Activity;
}

const str = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

/** One plain-Chinese sentence describing what this step did, built only from structured fields. */
function describe(event: AgentTraceEvent): string | undefined {
  const d = event.detail;
  const failure = str(d.failure_type) ? (FAILURE_LABELS[str(d.failure_type)!] ?? str(d.failure_type)) : undefined;
  switch (event.step) {
    case "retrieve": {
      const count = typeof d.result_count === "number" ? `，找到 ${d.result_count} 段资料` : "";
      return `用「${str(d.query) ?? "原问题"}」检索${count}`;
    }
    case "evidence_evaluate":
      return event.status === "PASS" ? "资料足以回答这个问题" : `资料不够用${failure ? `：${failure}` : ""}`;
    case "failure_diagnose":
      return str(d.rewritten_query)
        ? `${failure ?? "检索不理想"}，准备改问：「${str(d.rewritten_query)}」`
        : `${failure ?? "检索不理想"}，不再继续检索`;
    case "query_rewrite":
      return `「${str(d.from) ?? "原问法"}」→「${str(d.to) ?? ""}」`;
    case "answer_verify":
    case "answer_reverify":
      return event.status === "PASS" ? "回答的每个说法都有资料依据" : `发现问题：${failure ?? "回答依据不足"}`;
    case "answer_diagnose":
      return str(d.sub_query) ? `拆出要补查的问题：「${str(d.sub_query)}」` : failure;
    case "retrieve_missing":
      return `补查：「${str(d.query) ?? ""}」`;
    case "regenerate":
      return event.status === "ABSTAIN" ? "没有可用资料，不再作答" : "只依据已找到的资料重新写回答";
    case "partial_answer":
      return "资料只覆盖了问题的一部分：先给出有依据的内容，并说明哪些没有规定";
    case "abstain":
      return "资料库里没有足够依据，如实告知而不编造";
    case "max_rounds_reached":
      return `最多检索 ${typeof d.max_rounds === "number" ? d.max_rounds : ""} 轮，已到上限`;
    default:
      return str(d.failure_reason) ?? str(d.query);
  }
}

function TraceNode({ data }: { data: { event: AgentTraceEvent } }) {
  const { event } = data;
  const Icon = iconFor(event.step);
  const pass = event.status === "PASS" || event.status === "COMPLETE";
  const fail = ["FAIL", "ABSTAIN", "STOP", "REWRITE", "EXPAND", "RETRIEVE", "EMPTY"].includes(event.status);
  const detail = event.detail;
  const explanation = describe(event);
  return (
    <div
      className={cn(
        "w-64 rounded-xl border bg-card px-3 py-2.5 shadow-sm",
        pass && "border-emerald-500/30",
        fail && "border-amber-500/40",
        !pass && !fail && "border-border",
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-border" />
      <div className="flex items-center gap-2">
        <span className={cn("rounded-md p-1.5", pass ? "bg-emerald-500/10 text-emerald-600" : fail ? "bg-amber-500/10 text-amber-600" : "bg-muted text-muted-foreground")}>
          {fail ? <CircleAlert className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{LABELS[event.step] ?? event.step}</p>
          <p className="text-muted-foreground text-[11px]">
            第 {event.round} 轮 · {STATUS_LABELS[event.status] ?? event.status}
          </p>
        </div>
        {pass && <Check className="h-4 w-4 text-emerald-600" />}
      </div>
      {explanation && <p className="text-muted-foreground mt-2 line-clamp-3 text-xs leading-relaxed">{explanation}</p>}
      {typeof detail.groundedness === "number" && (
        <p className="text-muted-foreground mt-1.5 text-xs">
          有据可查 {Math.round(detail.groundedness * 100)}% · 引用覆盖 {Math.round(Number(detail.citation_coverage ?? 0) * 100)}%
        </p>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-border" />
    </div>
  );
}

const nodeTypes = { trace: TraceNode };

export function AgentTracePanel({ trace }: { trace: AgentTraceEvent[] }) {
  const nodes: Node[] = trace.map((event, index) => ({
    id: `${index}-${event.step}`,
    type: "trace",
    position: { x: 18, y: 16 + index * 128 },
    draggable: false,
    data: { event },
  }));
  const edges: Edge[] = nodes.slice(1).map((node, index) => ({
    id: `edge-${index}`,
    source: nodes[index]!.id,
    target: node.id,
    type: "smoothstep",
    animated: trace[index + 1]?.status === "FAIL",
    style: { stroke: "var(--color-border)", strokeWidth: 1.5 },
  }));

  return (
    <aside className="bg-muted/15 hidden w-[340px] shrink-0 border-l lg:flex lg:flex-col">
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4" />
          <h2 className="text-sm font-semibold">运作流程</h2>
        </div>
        <p className="text-muted-foreground mt-0.5 text-xs">每一步怎么找、怎么核对、怎么纠错</p>
      </div>
      {trace.length === 0 ? (
        <div className="text-muted-foreground m-4 rounded-xl border border-dashed p-4 text-sm leading-relaxed">
          提出问题后，这里会逐步显示系统如何检索资料、判断够不够用、发现问题时如何改正。
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.12 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            zoomOnDoubleClick={false}
            panOnDrag
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      )}
    </aside>
  );
}
