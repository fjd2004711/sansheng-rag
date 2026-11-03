"use client";

import { memo, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
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

import { levelsOf, type NodeProgress } from "@/lib/orchestration";
import { cn } from "@/lib/utils";
import type { GraphNode, SpecGraph } from "@/types/orchestration";

import { KIND_META, KindIcon, StatusIcon } from "./meta";

type CardData = { node: GraphNode; progress?: NodeProgress; selected: boolean };

const NodeCard = memo(function NodeCard({ data }: NodeProps<Node<CardData>>) {
  const { node, progress, selected } = data;
  const status = progress?.status ?? "pending";
  const showBar = progress && progress.total > 1;
  return (
    <div
      className={cn(
        "bg-card group flex h-[88px] w-[204px] flex-col justify-between rounded-lg border p-2.5 transition-colors",
        "hover:border-foreground/30",
        status === "running" && "border-sky-500 ring-2 ring-sky-500/20",
        status === "done" && "border-border",
        status === "failed" && "border-red-500/60",
        status === "pending" && "opacity-95",
        status === "skipped" && "border-dashed opacity-75",
        node.kind === "gate" && status === "pending" && "border-dashed",
        selected && "ring-brand ring-2",
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-border !h-2 !w-2 !border-0" />
      <div className="flex items-start gap-2.5">
        <KindIcon kind={node.kind} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[13px] font-semibold tracking-tight">{node.id}</span>
            <StatusIcon status={status} className="h-3.5 w-3.5" />
          </div>
          <p className="text-muted-foreground flex items-center gap-1.5 truncate text-xs">
            <span className="truncate">{node.role || KIND_META[node.kind].label}</span>
            {node.independent && (
              <ShieldCheck className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="独立核查" />
            )}
            {!node.essential && <span className="bg-muted shrink-0 rounded px-1 text-[10px]">可取消</span>}
          </p>
        </div>
      </div>
      {showBar && (
        <div>
          <div className="bg-muted h-1 overflow-hidden rounded-full">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                status === "failed" ? "bg-red-500" : "bg-emerald-500",
              )}
              style={{
                width: `${Math.min(100, (progress.done / Math.max(progress.total, 1)) * 100)}%`,
              }}
            />
          </div>
          <p className="text-muted-foreground mt-1 text-[11px] tabular-nums">
            {progress.done} / {progress.total} 个任务
          </p>
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-border !h-2 !w-2 !border-0" />
    </div>
  );
});

const nodeTypes = { card: NodeCard };

/** The workflow as a canvas (Dify / n8n style): node cards, live status, click to inspect. */
export function FlowCanvas({
  graph,
  progress,
  selected,
  onSelect,
  className,
}: {
  graph: SpecGraph;
  progress?: Record<string, NodeProgress>;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  className?: string;
}) {
  const { nodes, edges } = useMemo(() => {
    const levels = levelsOf(graph);
    // Nodes that share a column (parallel branches, a repair loop under its gate) stack downward, in node order.
    const used: Record<number, number> = {};
    const placed: Node<CardData>[] = graph.nodes.map((node) => {
      const col = levels[node.id] ?? 0;
      const isRepair = graph.edges.some((e) => e.kind === "repair" && e.target === node.id);
      const row = Math.max(used[col] ?? 0, isRepair ? 1 : 0);
      used[col] = row + 1;
      return {
        id: node.id,
        type: "card",
        position: { x: col * 236, y: row * 108 },
        data: { node, progress: progress?.[node.id], selected: selected === node.id },
        draggable: false,
      };
    });
    const flow: Edge[] = graph.edges.map((e) => {
      const repair = e.kind === "repair";
      const live = progress?.[e.target]?.status === "running";
      return {
        id: `${e.kind}:${e.source}->${e.target}`,
        source: e.source,
        target: e.target,
        type: "smoothstep",
        animated: live,
        label: repair ? "未达标" : undefined,
        labelStyle: { fontSize: 11, fill: "#ef4444" },
        labelBgStyle: { fill: "var(--color-card)" },
        style: {
          strokeWidth: 1.5,
          stroke: repair ? "#ef4444" : live ? "#0ea5e9" : "var(--color-muted-foreground)",
          strokeOpacity: repair || live ? 1 : 0.45,
          strokeDasharray: repair ? "6 5" : undefined,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: repair ? "#ef4444" : "var(--color-muted-foreground)",
        },
      };
    });
    return { nodes: placed, edges: flow };
  }, [graph, progress, selected]);

  const key = graph.nodes.map((n) => n.id).join(",");
  return (
    <div className={cn("bg-muted/30 h-full w-full", className)}>
      <ReactFlowProvider>
        <ReactFlow
          key={key}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.06, maxZoom: 1.3 }}
          minZoom={0.25}
          maxZoom={1.6}
          nodesConnectable={false}
          nodesDraggable={false}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, node) => onSelect?.(node.id)}
          onPaneClick={() => onSelect?.(null)}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1.4}
            color="var(--color-border)"
          />
          <Controls showInteractive={false} position="bottom-left" />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
