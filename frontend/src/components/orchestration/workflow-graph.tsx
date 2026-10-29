"use client";

import { useMemo } from "react";
import {
  Background,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ShieldCheck } from "lucide-react";

import {
  levelsOf,
  NODE_KIND_LABELS,
  type NodeProgress,
  type TaskStatus,
} from "@/lib/orchestration";
import { cn } from "@/lib/utils";
import type { GraphNode, SpecGraph } from "@/types/orchestration";

const STATUS_STYLE: Record<TaskStatus, string> = {
  pending: "border-border bg-card text-muted-foreground",
  running: "border-sky-500 bg-sky-500/10 text-foreground shadow-[0_0_0_3px_rgba(14,165,233,0.15)]",
  done: "border-emerald-500/70 bg-emerald-500/10 text-foreground",
  failed: "border-red-500 bg-red-500/10 text-foreground",
  skipped: "border-dashed border-border bg-muted/40 text-muted-foreground",
};

const STATUS_TEXT: Record<TaskStatus, string> = {
  pending: "等待",
  running: "运行中",
  done: "完成",
  failed: "失败",
  skipped: "已跳过",
};

type FlowData = { node: GraphNode; progress?: NodeProgress };

function WorkflowNode({ data }: NodeProps<Node<FlowData>>) {
  const { node, progress } = data;
  const status = progress?.status ?? "pending";
  return (
    <div
      className={cn(
        "w-[138px] rounded-lg border-2 px-3 py-2 text-xs transition-colors",
        STATUS_STYLE[status],
        node.kind === "gate" && "border-dashed",
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground" />
      <div className="flex items-center justify-between gap-1">
        <span className="truncate font-semibold">{node.id}</span>
        <span className="text-[10px] opacity-70">{NODE_KIND_LABELS[node.kind]}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-1 truncate opacity-80">
        {node.independent && (
          <ShieldCheck className="h-3 w-3 shrink-0 text-emerald-600" aria-label="独立核查" />
        )}
        <span className="truncate">{node.role || (node.kind === "gate" ? "达标才放行" : "")}</span>
      </div>
      {progress && (
        <div className="mt-1 text-[10px] opacity-80">
          {STATUS_TEXT[status]}
          {progress.total > 1 ? ` · ${progress.done}/${progress.total}` : ""}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-muted-foreground" />
    </div>
  );
}

const nodeTypes = { workflow: WorkflowNode };

/** Draws a workflow definition; with ``progress`` the nodes are coloured live from a run's events. */
export function WorkflowGraph({
  graph,
  progress,
  height = 340,
}: {
  graph: SpecGraph;
  progress?: Record<string, NodeProgress>;
  height?: number;
}) {
  const { nodes, edges } = useMemo(() => {
    const levels = levelsOf(graph);
    const perLevel: Record<number, number> = {};
    const placed: Node<FlowData>[] = graph.nodes.map((node) => {
      const col = levels[node.id] ?? 0;
      // A triggered loop node hangs below its gate instead of taking a column of its own.
      const isRepair = graph.edges.some((e) => e.kind === "repair" && e.target === node.id);
      const row = isRepair ? (perLevel[col] = (perLevel[col] ?? 0) + 1) : (perLevel[col] ?? 0);
      if (!isRepair) perLevel[col] = Math.max(perLevel[col] ?? 0, 0);
      return {
        id: node.id,
        type: "workflow",
        position: { x: col * 168, y: row * 84 },
        data: { node, progress: progress?.[node.id] },
        draggable: false,
      };
    });
    const flowEdges: Edge[] = graph.edges.map((e) => {
      const repair = e.kind === "repair";
      const live = progress?.[e.target]?.status === "running";
      return {
        id: `${e.kind}:${e.source}->${e.target}`,
        source: e.source,
        target: e.target,
        animated: live,
        label: repair ? "未达标" : undefined,
        style: {
          strokeDasharray: repair ? "5 4" : undefined,
          stroke: repair ? "#ef4444" : undefined,
        },
        markerEnd: { type: MarkerType.ArrowClosed },
      };
    });
    return { nodes: placed, edges: flowEdges };
  }, [graph, progress]);

  return (
    <div style={{ height }} className="bg-muted/20 overflow-hidden rounded-lg border">
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.12 }}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
          minZoom={0.3}
        >
          <Background gap={18} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
