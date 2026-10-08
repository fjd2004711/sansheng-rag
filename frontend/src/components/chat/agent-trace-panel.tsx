"use client";

import { Background, Controls, Handle, Position, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Activity, Check, CircleAlert, Search, ShieldCheck, WandSparkles } from "lucide-react";
import type { AgentTraceEvent } from "@/types";
import { cn } from "@/lib/utils";

const labels: Record<string, string> = {
  retrieve: "Retrieve",
  evidence_evaluate: "Evidence Judge",
  failure_diagnose: "Failure Diagnosis",
  query_rewrite: "Rewrite Query",
  answer_verify: "Verify Answer",
  answer_diagnose: "Answer Diagnosis",
  retrieve_missing: "Retrieve Missing",
  regenerate: "Regenerate",
  answer_reverify: "Verify Revision",
  abstain: "Abstain",
  max_rounds_reached: "Max Rounds Reached",
};

function iconFor(step: string) {
  if (step.includes("retriev")) return Search;
  if (step.includes("rewrite") || step.includes("regenerat")) return WandSparkles;
  if (step.includes("verify") || step.includes("evaluate")) return ShieldCheck;
  return Activity;
}

function TraceNode({ data }: { data: { event: AgentTraceEvent } }) {
  const { event } = data;
  const Icon = iconFor(event.step);
  const pass = event.status === "PASS" || event.status === "COMPLETE";
  const fail = event.status === "FAIL" || event.status === "ABSTAIN" || event.status === "STOP";
  const detail = event.detail;
  const reason = typeof detail.failure_reason === "string" ? detail.failure_reason : undefined;
  const query = typeof detail.query === "string" ? detail.query : undefined;
  const rewriteFrom = typeof detail.from === "string" ? detail.from : undefined;
  const rewriteTo = typeof detail.to === "string" ? detail.to : undefined;
  const missing = Array.isArray(detail.missing_information)
    ? detail.missing_information.filter((item): item is string => typeof item === "string").join(", ")
    : undefined;
  const explanation = rewriteTo ? `${rewriteFrom ?? "Query"} → ${rewriteTo}` : query ?? reason ?? missing;
  return (
    <div
      className={cn(
        "w-56 rounded-xl border bg-card px-3 py-2 shadow-sm",
        pass && "border-emerald-500/30",
        fail && "border-amber-500/40",
        !pass && !fail && "border-border",
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-border" />
      <div className="flex items-center gap-2">
        <span className={cn("rounded-md p-1.5", pass ? "bg-emerald-500/10 text-emerald-600" : fail ? "bg-amber-500/10 text-amber-600" : "bg-muted text-muted-foreground")}>
          {fail ? <CircleAlert className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">{labels[event.step] ?? event.step}</p>
          <p className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
            Round {event.round} · {event.status}
          </p>
        </div>
        {pass && <Check className="h-3.5 w-3.5 text-emerald-600" />}
      </div>
      {explanation && <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">{explanation}</p>}
      {typeof detail.groundedness === "number" && (
        <p className="mt-1.5 text-[10px] text-muted-foreground">Groundedness {Math.round(detail.groundedness * 100)}% · Citation coverage {Math.round(Number(detail.citation_coverage ?? 0) * 100)}%</p>
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
    position: { x: 18, y: 16 + index * 112 },
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
    <aside className="hidden w-[310px] shrink-0 border-l bg-muted/15 xl:flex xl:flex-col">
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2"><Activity className="h-4 w-4" /><h2 className="text-sm font-semibold">Agent Process</h2></div>
        <p className="mt-0.5 text-xs text-muted-foreground">Diagnosis, correction, and verification</p>
      </div>
      {trace.length === 0 ? (
        <div className="m-4 rounded-xl border border-dashed p-4 text-xs leading-relaxed text-muted-foreground">Ask a question to inspect the agent&apos;s retrieval and verification path.</div>
      ) : (
        <div className="min-h-0 flex-1"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.18 }} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} zoomOnDoubleClick={false} panOnDrag>
          <Background gap={16} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow></div>
      )}
    </aside>
  );
}
