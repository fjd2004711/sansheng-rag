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

/** One accent colour per node kind; it tints the card edge, the glow and the flowing edges. */
const ACCENT: Record<GraphNode["kind"], string> = {
  agent: "#38bdf8",
  map: "#a78bfa",
  gate: "#fbbf24",
  loop: "#fb7185",
  merge: "#34d399",
};

const NodeCard = memo(function NodeCard({ data }: NodeProps<Node<CardData>>) {
  const { node, progress, selected } = data;
  const status = progress?.status ?? "pending";
  const showBar = progress && progress.total > 1;
  const accent = ACCENT[node.kind];
  const pct = progress ? Math.min(100, (progress.done / Math.max(progress.total, 1)) * 100) : 0;
  return (
    <div
      style={{ "--accent": accent } as React.CSSProperties}
      className={cn(
        "group relative flex h-[122px] w-[208px] flex-col justify-between overflow-hidden rounded-2xl border p-3 backdrop-blur transition-all duration-300",
        "bg-gradient-to-b from-white/[0.06] to-white/[0.015] shadow-[0_8px_30px_-12px_rgba(0,0,0,0.6)] hover:-translate-y-0.5",
        status === "pending" && "border-white/10 opacity-90",
        status === "running" && "flow-node-running border-[color:var(--accent)]",
        status === "done" && "border-emerald-400/40 shadow-[0_0_28px_-10px_rgba(52,211,153,0.55)]",
        status === "failed" && "border-red-500/70 shadow-[0_0_28px_-8px_rgba(239,68,68,0.6)]",
        status === "skipped" && "border-dashed border-white/15 opacity-60",
        node.kind === "gate" && status === "pending" && "border-dashed",
        selected && "ring-2 ring-white/70",
      )}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{
          background: `linear-gradient(90deg, ${accent}, transparent 85%)`,
          opacity: status === "pending" ? 0.45 : 1,
        }}
      />
      <Handle type="target" position={Position.Left} className="!bg-white/40 !h-2 !w-2 !border-0" />
      <div className="flex items-start gap-3">
        <KindIcon kind={node.kind} className="h-10 w-10 rounded-xl [&>svg]:h-5 [&>svg]:w-5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[15px] font-semibold tracking-tight">{node.id}</span>
            <StatusIcon status={status} className="h-4 w-4" />
          </div>
          <p className="text-muted-foreground truncate text-xs">
            {node.role || KIND_META[node.kind].label}
          </p>
          <p className="mt-0.5 text-[10px] tracking-wider uppercase" style={{ color: accent }}>
            {KIND_META[node.kind].label}
          </p>
        </div>
      </div>
      {showBar ? (
        <div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                status === "failed" && "bg-red-500",
              )}
              style={{
                width: `${pct}%`,
                background: status === "failed" ? undefined : `linear-gradient(90deg, ${accent}, #34d399)`,
              }}
            />
          </div>
          <p className="text-muted-foreground mt-1 text-[11px] tabular-nums">
            {progress.done} / {progress.total} 个任务
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          {node.independent && (
            <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
              <ShieldCheck className="h-2.5 w-2.5" />
              独立核查
            </span>
          )}
          {!node.essential && (
            <span className="rounded bg-white/8 px-1.5 py-0.5 text-[10px] text-white/55">可取消</span>
          )}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-white/40 !h-2 !w-2 !border-0" />
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
        position: { x: col * 240, y: row * 150 },
        data: { node, progress: progress?.[node.id], selected: selected === node.id },
        draggable: false,
      };
    });
    const flow: Edge[] = graph.edges.map((e) => {
      const repair = e.kind === "repair";
      const live = progress?.[e.target]?.status === "running";
      const done = progress?.[e.source]?.status === "done" && !live;
      return {
        id: `${e.kind}:${e.source}->${e.target}`,
        source: e.source,
        target: e.target,
        type: "smoothstep",
        animated: live,
        label: repair ? "未达标" : undefined,
        labelStyle: { fontSize: 11, fill: "#fb7185" },
        labelBgStyle: { fill: "var(--color-card)" },
        className: live ? "flow-edge-live" : undefined,
        style: {
          strokeWidth: live ? 2.5 : 2,
          stroke: repair ? "#fb7185" : live ? "#38bdf8" : done ? "#34d399" : "rgba(255,255,255,0.28)",
          strokeOpacity: repair || live ? 1 : done ? 0.7 : 1,
          strokeDasharray: repair ? "6 5" : undefined,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: repair ? "#fb7185" : live ? "#38bdf8" : done ? "#34d399" : "rgba(255,255,255,0.4)",
        },
      };
    });
    return { nodes: placed, edges: flow };
  }, [graph, progress, selected]);

  const key = graph.nodes.map((n) => n.id).join(",");
  return (
    <div className={cn("flow-canvas-bg theme-dark h-full w-full", className)}>
      <ReactFlowProvider>
        <ReactFlow
          key={key}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.05, maxZoom: 1.3 }}
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
            gap={26}
            size={1.5}
            color="rgba(255,255,255,0.09)"
          />
          <Controls showInteractive={false} position="bottom-left" />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
