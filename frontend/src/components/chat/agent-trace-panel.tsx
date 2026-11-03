"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Activity, Check, CircleAlert, Search, ShieldCheck, WandSparkles, X } from "lucide-react";
import type { AgentTraceEvent } from "@/types";
import { StatusMark } from "@/components/ui";
import { cn } from "@/lib/utils";
import { formatSeconds, stepSeconds } from "@/lib/step-timing";
import { ResizeHandle } from "@/components/ui";
import { useResizableWidth } from "@/hooks/use-resizable-width";
import { StepBody, chunksOf, type RetrievedChunk } from "./trace-detail";
import { useTraceDetailStore } from "@/stores/trace-detail-store";
import { describeResearchStep } from "@/lib/research-trace";
import { TRACE_FAILURE_LABELS, TRACE_STATUS_LABELS, TRACE_STEP_LABELS } from "@/lib/agent-trace-labels";

const LABELS = TRACE_STEP_LABELS;
const STATUS_LABELS = TRACE_STATUS_LABELS;
const FAILURE_LABELS = TRACE_FAILURE_LABELS;

const HOW_IT_WORKS = [
  { icon: Search, title: "检索资料", text: "在资料库里找出和问题最相关的几段原文" },
  { icon: ShieldCheck, title: "判断够不够用", text: "不够就分析原因，换个问法再找（最多两轮）" },
  { icon: WandSparkles, title: "写出回答", text: "只依据找到的资料作答，并标明出处" },
  { icon: Check, title: "核对回答", text: "逐条检查说法有没有依据；没有就纠正，或如实说查不到" },
];

function iconFor(step: string) {
  if (step.includes("retriev") || step.startsWith("web_") || step === "research_plan") return Search;
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
    case "question_condense":
      return `「${str(d.from) ?? ""}」→「${str(d.to) ?? ""}」`;
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
      return describeResearchStep(event) ?? str(d.failure_reason) ?? str(d.query);
  }
}

function TraceNode({ data, selected }: NodeProps<Node<{ event: AgentTraceEvent; seconds?: number }>>) {
  const { event } = data;
  const Icon = iconFor(event.step);
  const pass = event.status === "PASS" || event.status === "COMPLETE";
  const fail = ["FAIL", "ABSTAIN", "STOP", "REWRITE", "EXPAND", "RETRIEVE", "EMPTY"].includes(event.status);
  const detail = event.detail;
  const explanation = describe(event);
  return (
    <div
      className={cn(
        "slip w-64 cursor-pointer px-3.5 py-3 transition-colors",
        selected && "outline-brand outline-2 outline-offset-2",
        fail && "border-amber-500/60",
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-foreground/40 !h-1.5 !w-1.5 !border-0" />
      <div className="flex items-center gap-2">
        <span className={cn(pass ? "text-emerald-600" : fail ? "text-amber-600" : "text-muted-foreground")}>
          {fail ? <CircleAlert className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display truncate text-[15px] font-bold tracking-wide">{LABELS[event.step] ?? event.step}</p>
          <p className="text-muted-foreground font-kai text-[12px]">
            第 {event.round} 轮 · {STATUS_LABELS[event.status] ?? event.status}
            {typeof data.seconds === "number" && ` · ${formatSeconds(data.seconds)}`}
          </p>
        </div>
        <StatusMark status={pass ? "done" : fail ? "warn" : "running"} />
      </div>
      {explanation && (
        <p className="border-foreground/12 text-foreground/75 mt-2.5 line-clamp-3 border-t pt-2 text-xs leading-relaxed">
          {explanation}
        </p>
      )}
      {typeof detail.groundedness === "number" && (
        <p className="text-muted-foreground mt-1.5 text-xs">
          有据可查 {Math.round(detail.groundedness * 100)}% · 引用覆盖 {Math.round(Number(detail.citation_coverage ?? 0) * 100)}%
        </p>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-foreground/40 !h-1.5 !w-1.5 !border-0" />
    </div>
  );
}

const nodeTypes = { trace: TraceNode };

/** Re-fit the view whenever a step is added, so live updates stay in frame. */
function RefitOnGrow({ count }: { count: number }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    fitView({ padding: 0.12, duration: 200 });
  }, [count, fitView]);
  return null;
}

function StepDetail({
  event,
  index,
  chunks,
  onClose,
}: {
  event: AgentTraceEvent;
  index: number;
  chunks: RetrievedChunk[];
  onClose: () => void;
}) {
  return (
    <section className="bg-background absolute inset-x-0 bottom-0 z-10 flex max-h-[65%] flex-col border-t shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.25)]">
      <header className="flex items-start gap-2 border-b px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">
            第 {index + 1} 步 · {LABELS[event.step] ?? event.step}
          </h3>
          <p className="text-muted-foreground text-xs">
            第 {event.round} 轮 · {STATUS_LABELS[event.status] ?? event.status}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭详情"
          className="text-muted-foreground hover:text-foreground rounded-md p-1"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <StepBody event={event} chunks={chunks} />
      </div>
    </section>
  );
}

export function AgentTracePanel({
  trace,
  title,
  messageId,
  variant = "side",
}: {
  trace: AgentTraceEvent[];
  title?: string;
  messageId?: string;
  /** "side" is the resizable desktop column; "sheet" fills a narrow-screen drawer. */
  variant?: "side" | "sheet";
}) {
  const sheet = variant === "sheet";
  const openDetail = useTraceDetailStore((state) => state.open);
  const resize = useResizableWidth({ storageKey: "rag.trace.width", initial: 340, min: 280, max: 720, edge: "left" });
  const [selected, setSelected] = useState<number | null>(null);

  // A different answer's flow (or a shorter trace) invalidates the open card.
  useEffect(() => setSelected(null), [messageId]);

  const nodes: Node[] = useMemo(
    () =>
      trace.map((event, index) => ({
        id: String(index),
        type: "trace",
        position: { x: 18, y: 16 + index * 168 },
        draggable: false,
        selected: index === selected,
        data: { event, seconds: stepSeconds(trace, index) },
      })),
    [trace, selected],
  );
  const edges: Edge[] = useMemo(
    () =>
      trace.slice(1).map((event, index) => ({
        id: `edge-${index}`,
        source: String(index),
        target: String(index + 1),
        type: "smoothstep",
        animated: event.status === "FAIL",
        style: { stroke: "var(--color-border)", strokeWidth: 1.5 },
      })),
    [trace],
  );

  const selectedEvent = selected !== null ? trace[selected] : undefined;
  const selectedChunks = useMemo(() => {
    // Each judgement refers to the chunks of the most recent search before it.
    let latest: RetrievedChunk[] = [];
    for (let i = 0; i <= (selected ?? -1); i++) {
      if (trace[i]?.step === "retrieve") latest = chunksOf(trace[i]!.detail);
    }
    return latest;
  }, [trace, selected]);

  return (
    <aside
      style={sheet ? undefined : { width: resize.width }}
      className={cn(
        "bg-muted/15 relative flex-col",
        sheet ? "flex h-full w-full" : "hidden shrink-0 border-l lg:flex",
      )}
    >
      {!sheet && (
        <ResizeHandle edge="left" label="调整运作流程宽度" dragging={resize.dragging} aria={resize.aria} {...resize.handleProps} />
      )}
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity className="text-brand h-4 w-4" />
          <h2 className="font-display text-base font-bold tracking-[0.12em]">运作流程</h2>
        </div>
        <p className="text-muted-foreground font-kai mt-0.5 text-[13px]">滚轮缩放、拖动画布；点击卡片查看这一步的详情</p>
        {messageId && trace.length > 0 && (
          <button
            type="button"
            onClick={() => openDetail(messageId)}
            className="border-foreground/25 hover:border-foreground/45 hover:bg-accent bg-card mt-2.5 w-full rounded-sm border px-3 py-1.5 text-xs font-medium tracking-wide transition-colors"
          >
            展开详细过程：搜了什么、为什么
          </button>
        )}
        {title && (
          <p className="border-foreground/15 font-kai mt-2.5 line-clamp-2 border-y px-0.5 py-1.5 text-[13px] leading-relaxed" title={title}>
            针对：{title}
          </p>
        )}
      </div>
      {trace.length === 0 ? (
        <div className="m-4 space-y-3 text-sm">
          <p className="text-muted-foreground text-xs">提出问题后，这里会实时显示系统是怎么答的。大致有四步：</p>
          <ol className="space-y-2.5">
            {HOW_IT_WORKS.map(({ icon: StepIcon, title, text }, index) => (
              <li key={title} className="flex gap-3">
                <span className="border-foreground/30 text-muted-foreground flex h-7 w-7 shrink-0 items-center justify-center border">
                  <StepIcon className="h-3.5 w-3.5" />
                </span>
                <span className="leading-relaxed">
                  <span className="font-medium">
                    {index + 1}. {title}
                  </span>
                  <span className="text-muted-foreground block text-xs">{text}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.12 }}
              minZoom={0.3}
              maxZoom={2}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable
              zoomOnScroll
              zoomOnPinch
              zoomOnDoubleClick={false}
              panOnDrag
              preventScrolling
              onNodeClick={(_, node) => setSelected(Number(node.id))}
              onPaneClick={() => setSelected(null)}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Lines} gap={28} lineWidth={1} color="oklch(from var(--color-foreground) l c h / 0.05)" />
              <Controls showInteractive={false} position="top-right" />
              <RefitOnGrow count={trace.length} />
            </ReactFlow>
          </ReactFlowProvider>
          {selectedEvent && selected !== null && (
            <StepDetail event={selectedEvent} index={selected} chunks={selectedChunks} onClose={() => setSelected(null)} />
          )}
        </div>
      )}
    </aside>
  );
}
