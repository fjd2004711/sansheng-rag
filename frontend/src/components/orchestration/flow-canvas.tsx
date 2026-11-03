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

import { levelsOf, type NodeProgress } from "@/lib/orchestration";
import { StatusMark, type MarkStatus } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { GraphNode, SpecGraph } from "@/types/orchestration";

import { KIND_META, KindIcon } from "./meta";

type CardData = { node: GraphNode; progress?: NodeProgress; selected: boolean };

const MARK: Record<string, MarkStatus> = {
  pending: "pending",
  running: "running",
  done: "done",
  failed: "failed",
  skipped: "skipped",
};

const NodeCard = memo(function NodeCard({ data }: NodeProps<Node<CardData>>) {
  const { node, progress, selected } = data;
  const status = progress?.status ?? "pending";
  const showBar = progress && progress.total > 1;
  const role = node.role || KIND_META[node.kind].label;
  const title = role.split(/[（(]/)[0];
  return (
    <div
      title={role}
      className={cn(
        "slip group flex h-[88px] w-[204px] flex-col justify-between px-3 py-2.5 transition-colors",
        status === "running" && "slip-running",
        status === "failed" && "border-red-500/70",
        status === "pending" && "opacity-95",
        status === "skipped" && "border-dashed opacity-75",
        node.kind === "gate" && status === "pending" && "border-dashed",
        selected && "outline-brand outline-2 outline-offset-2",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-foreground/40 !h-1.5 !w-1.5 !border-0"
      />
      <div className="flex items-start gap-2">
        <KindIcon kind={node.kind} plain className="mt-0.5 [&_svg]:h-4 [&_svg]:w-4" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-display truncate text-[14px] font-bold tracking-wide">
              {title}
            </span>
            <StatusMark status={MARK[status] ?? "pending"} />
          </div>
          <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5 truncate text-[11px]">
            <span className="truncate font-mono">{node.id}</span>
            {node.independent && (
              <span
                className="font-display shrink-0 border border-emerald-600/60 px-1 text-[10px] leading-4 text-emerald-700 dark:text-emerald-400"
                aria-label="独立核查"
              >
                独立
              </span>
            )}
            {!node.essential && <span className="font-kai shrink-0 text-[11px]">可取消</span>}
          </p>
        </div>
      </div>
      {showBar && (
        <div className="flex items-center gap-2">
          <div className="bg-foreground/12 relative h-[3px] flex-1">
            <div
              className={cn(
                "absolute inset-y-0 left-0 transition-all",
                status === "failed" ? "bg-red-500" : "bg-emerald-500",
              )}
              style={{
                width: `${Math.min(100, (progress.done / Math.max(progress.total, 1)) * 100)}%`,
              }}
            />
          </div>
          <span className="font-kai text-muted-foreground text-[12px] tabular-nums">
            {progress.done} / {progress.total}
          </span>
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-foreground/40 !h-1.5 !w-1.5 !border-0"
      />
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
        position: { x: col * 226, y: row * 108 },
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
        labelStyle: { fontSize: 11, fill: "var(--color-red-500)" },
        labelBgStyle: { fill: "var(--color-card)" },
        style: {
          strokeWidth: 1.5,
          stroke: repair
            ? "var(--color-red-500)"
            : live
              ? "var(--color-sky-500)"
              : "var(--color-muted-foreground)",
          strokeOpacity: repair || live ? 1 : 0.45,
          strokeDasharray: repair ? "6 5" : undefined,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: repair ? "var(--color-red-500)" : "var(--color-muted-foreground)",
        },
      };
    });
    return { nodes: placed, edges: flow };
  }, [graph, progress, selected]);

  const key = graph.nodes.map((n) => n.id).join(",");
  return (
    <div className={cn("h-full w-full", className)}>
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
          {/* Squared manuscript paper (稿纸) under the slips. */}
          <Background
            variant={BackgroundVariant.Lines}
            gap={28}
            lineWidth={1}
            color="oklch(from var(--color-foreground) l c h / 0.05)"
          />
          <Controls showInteractive={false} position="bottom-left" />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
