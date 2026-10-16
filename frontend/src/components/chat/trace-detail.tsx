"use client";

import { useEffect, type ReactNode } from "react";
import { ArrowRight, Check, CircleAlert, FileText, Search, X } from "lucide-react";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui";
import {
  RETRIEVAL_SCORE_LABELS,
  TRACE_ACTION_LABELS,
  TRACE_STATUS_LABELS,
  TRACE_STEP_LABELS,
  describeFailure,
} from "@/lib/agent-trace-labels";
import { deriveVerdict } from "@/lib/answer-verdict";
import { cn } from "@/lib/utils";
import { formatSeconds, stepSeconds, totalSeconds } from "@/lib/step-timing";
import { useTraceDetailStore } from "@/stores/trace-detail-store";
import { useChatStore } from "@/stores/chat-store";
import type { AgentTraceEvent } from "@/types";
import { RESEARCH_STEPS } from "@/lib/research-trace";
import { ResearchStepBody } from "./research-step-body";

type Detail = Record<string, unknown>;

export interface RetrievedChunk {
  source: string;
  page?: number | null;
  chunk?: number | null;
  snippet: string;
  scores: Record<string, number>;
}

const str = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;
const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "") : [];
const pct = (value: unknown): number => Math.max(0, Math.min(1, typeof value === "number" ? value : 0));

export function chunksOf(detail: Detail): RetrievedChunk[] {
  return Array.isArray(detail.results) ? (detail.results as RetrievedChunk[]) : [];
}

function Bar({ value, tone }: { value: number; tone: "good" | "warn" | "bad" }) {
  return (
    <span className="bg-muted inline-block h-1.5 w-24 overflow-hidden rounded-full align-middle" aria-hidden>
      <span
        className={cn(
          "block h-full rounded-full",
          tone === "good" ? "bg-emerald-500" : tone === "warn" ? "bg-amber-500" : "bg-red-400",
        )}
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </span>
  );
}

function Reason({ title, children, tone = "warn" }: { title: string; children: ReactNode; tone?: "warn" | "good" }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2 text-sm leading-relaxed",
        tone === "warn" ? "border-amber-500/40 bg-amber-500/5" : "border-emerald-500/30 bg-emerald-500/5",
      )}
    >
      <p className="text-xs font-semibold">{title}</p>
      <div className="text-foreground/80 mt-0.5">{children}</div>
    </div>
  );
}

function Missing({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="text-sm">
      <p className="text-muted-foreground text-xs font-semibold">还缺少</p>
      <ul className="mt-0.5 list-disc space-y-0.5 pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function Query({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-sm">
      <span className="text-muted-foreground mr-1.5 text-xs">{label}</span>
      <span className="bg-muted rounded px-1.5 py-0.5 font-medium">{value}</span>
    </p>
  );
}

function formatScore(name: string, value: number): string {
  if (name === "reranker_score") return `${Math.round(value)} / 100`;
  return value.toFixed(name === "bm25_score" ? 1 : name === "rrf_score" ? 3 : 2);
}

function ChunkRow({ chunk, relevance }: { chunk: RetrievedChunk; relevance?: number }) {
  const where = [chunk.page != null ? `第 ${chunk.page} 页` : null, chunk.chunk != null ? `第 ${Number(chunk.chunk) + 1} 段` : null]
    .filter(Boolean)
    .join(" · ");
  const scores = Object.entries(chunk.scores ?? {});
  return (
    <li className="border-border space-y-1 rounded-lg border p-2.5">
      <div className="flex items-center gap-2 text-sm">
        <FileText className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate font-medium" title={chunk.source}>
          {chunk.source}
        </span>
        {where && <span className="text-muted-foreground shrink-0 text-xs">{where}</span>}
      </div>
      <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
        {chunk.snippet.replace(/#+\s*/g, "")}
      </p>
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        {scores.map(([name, value]) => (
          <span key={name}>
            {RETRIEVAL_SCORE_LABELS[name] ?? name} {formatScore(name, value)}
          </span>
        ))}
        {relevance !== undefined && (
          <span className="ml-auto flex items-center gap-1.5">
            评审认为{relevance >= 0.5 ? "相关" : "不相关"}
            <Bar value={relevance} tone={relevance >= 0.5 ? "good" : "bad"} />
            {Math.round(relevance * 100)}%
          </span>
        )}
      </div>
    </li>
  );
}

const METRICS: Array<[string, string]> = [
  ["groundedness", "有据可查：回答的说法在资料里有依据"],
  ["completeness", "完整度：问题的各个方面都答到了"],
  ["answer_relevance", "切题：回答的就是被问的事"],
  ["citation_coverage", "引用覆盖：说法都标了出处"],
];

export function StepBody({ event, chunks }: { event: AgentTraceEvent; chunks: RetrievedChunk[] }) {
  const d = event.detail;
  switch (event.step) {
    case "retrieve": {
      const found = chunksOf(d);
      return (
        <div className="space-y-2">
          <Query label="搜索词" value={str(d.query) ?? "（原问题）"} />
          <p className="text-muted-foreground text-xs">
            {typeof d.result_count === "number" ? `找到 ${d.result_count} 段资料` : ""}
            {found.length ? "，按匹配程度从高到低：" : ""}
          </p>
          {found.length > 0 && (
            <ul className="space-y-1.5">
              {found.map((chunk, index) => (
                <ChunkRow key={`${chunk.source}-${index}`} chunk={chunk} />
              ))}
            </ul>
          )}
        </div>
      );
    }
    case "evidence_evaluate": {
      const scores = Array.isArray(d.relevance_scores) ? (d.relevance_scores as number[]) : [];
      return (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {event.status === "PASS" ? "判定：这些资料足以回答问题" : "判定：这些资料不足以回答问题"}
          </p>
          {event.status !== "PASS" && describeFailure(d) && <Reason title="为什么不够">{describeFailure(d)}</Reason>}
          <Missing items={list(d.missing_information)} />
          {scores.length > 0 && (
            <div>
              <p className="text-muted-foreground mb-1 text-xs font-semibold">逐段评审</p>
              <ul className="space-y-1.5">
                {scores.map((score, index) =>
                  chunks[index] ? (
                    <ChunkRow key={index} chunk={chunks[index]!} relevance={pct(score)} />
                  ) : (
                    <li key={index} className="text-muted-foreground text-xs">
                      第 {index + 1} 段：相关度 {Math.round(pct(score) * 100)}%
                    </li>
                  ),
                )}
              </ul>
            </div>
          )}
        </div>
      );
    }
    case "failure_diagnose":
      return (
        <div className="space-y-2">
          <p className="text-sm font-medium">决定：{TRACE_ACTION_LABELS[str(d.action) ?? ""] ?? str(d.action) ?? "—"}</p>
          {describeFailure(d) && <Reason title="原因">{describeFailure(d)}</Reason>}
          <Missing items={list(d.missing_information)} />
          {str(d.rewritten_query) && <Query label="准备改搜" value={str(d.rewritten_query)!} />}
        </div>
      );
    case "content_guard": {
      const flagged = Array.isArray(d.flagged) ? (d.flagged as Array<{ source: string; patterns: string[] }>) : [];
      return (
        <div className="space-y-1.5">
          <Reason title="已拦截">
            下面这些资料片段里含有像“指令”的文字（例如“忽略以上要求”）。系统只把它们当作普通资料，不会照着执行。
          </Reason>
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
            {flagged.map((item, index) => (
              <li key={index}>
                {item.source}
                <span className="text-muted-foreground text-xs">（{item.patterns.join("、")}）</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    case "question_condense":
      return (
        <div className="space-y-1.5 text-sm">
          <p className="text-muted-foreground text-xs">这是一个追问，系统结合前面的对话把它补全，再去检索：</p>
          <Query label="你问的" value={str(d.from) ?? "—"} />
          <ArrowRight className="text-muted-foreground ml-3 h-4 w-4 rotate-90" />
          <Query label="补全为" value={str(d.to) ?? "—"} />
        </div>
      );
    case "query_rewrite":
      return (
        <div className="space-y-1.5 text-sm">
          <Query label="原来" value={str(d.from) ?? "—"} />
          <ArrowRight className="text-muted-foreground ml-3 h-4 w-4 rotate-90" />
          <Query label="改成" value={str(d.to) ?? "—"} />
        </div>
      );
    case "max_rounds_reached":
      return (
        <Reason title="为什么停下">
          最多只检索 {typeof d.max_rounds === "number" ? d.max_rounds : "固定"} 轮，防止无休止地重试。
          {str(d.reason) ? `当前的情况：${str(d.reason)}` : ""}
        </Reason>
      );
    case "answer_verify":
    case "answer_reverify": {
      const claims = Array.isArray(d.claims) ? (d.claims as Array<{ claim: string; supported: boolean; reason?: string }>) : [];
      return (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {event.status === "PASS" ? "结论：回答通过核对" : "结论：回答没有通过核对"}
          </p>
          <div className="space-y-1">
            {METRICS.map(([key, label]) =>
              typeof d[key] === "number" ? (
                <p key={key} className="flex items-center gap-2 text-xs">
                  <Bar value={pct(d[key])} tone={pct(d[key]) >= 0.8 ? "good" : pct(d[key]) >= 0.5 ? "warn" : "bad"} />
                  <span className="w-9 tabular-nums">{Math.round(pct(d[key]) * 100)}%</span>
                  <span className="text-muted-foreground">{label}</span>
                </p>
              ) : null,
            )}
          </div>
          {event.status !== "PASS" && describeFailure(d) && <Reason title="问题出在哪">{describeFailure(d)}</Reason>}
          <Missing items={list(d.missing_information)} />
          {claims.length > 0 && (
            <div>
              <p className="text-muted-foreground mb-1 text-xs font-semibold">逐条检查回答里的说法</p>
              <ul className="space-y-1.5">
                {claims.map((claim, index) => (
                  <li key={index} className="flex gap-2 text-sm">
                    {claim.supported ? (
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <X className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                    )}
                    <span>
                      {claim.claim}
                      {claim.reason && <span className="text-muted-foreground block text-xs">{claim.reason}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    }
    case "answer_diagnose":
      return (
        <div className="space-y-2">
          {describeFailure(d) && <Reason title="回答的不足">{describeFailure(d)}</Reason>}
          <Missing items={list(d.missing_information)} />
          {str(d.sub_query) && <Query label="拆出的补查问题" value={str(d.sub_query)!} />}
        </div>
      );
    case "retrieve_missing":
      return (
        <div className="space-y-1.5">
          <Query label="补查" value={str(d.query) ?? "—"} />
          <p className="text-muted-foreground text-xs">{d.has_evidence ? "找到了新的资料" : "没有找到新的资料"}</p>
        </div>
      );
    case "regenerate":
      return (
        <p className="text-muted-foreground text-sm">
          {event.status === "ABSTAIN" ? str(d.reason) ?? "没有可用资料，不再作答。" : "只使用已经找到的资料，重新写一遍回答，再交回去核对。"}
        </p>
      );
    case "partial_answer":
      return (
        <div className="space-y-2">
          <Reason title="为什么只给了一部分">
            资料只覆盖了问题的一部分。有依据的内容已经给出，没有依据的部分在回答里已说明，没有编造。
          </Reason>
          <Missing items={list(d.missing_information)} />
        </div>
      );
    case "abstain":
      return (
        <Reason title="为什么没有回答">
          {str(d.reason) ?? "资料里没有足够的依据。"}
          <span className="text-muted-foreground block text-xs">宁可不答，也不编造。</span>
        </Reason>
      );
    default:
      if (RESEARCH_STEPS.has(event.step)) return <ResearchStepBody event={event} />;
      return str(d.failure_reason) ? <p className="text-sm">{str(d.failure_reason)}</p> : null;
  }
}

function StepCard({
  event,
  index,
  chunks,
  seconds,
}: {
  event: AgentTraceEvent;
  index: number;
  chunks: RetrievedChunk[];
  seconds?: number;
}) {
  const good = event.status === "PASS" || event.status === "COMPLETE";
  return (
    <li className="relative pl-10">
      <span
        className={cn(
          "absolute top-0 left-0 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
          good ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
        )}
      >
        {index + 1}
      </span>
      <div className="mb-1 flex flex-wrap items-center gap-x-2">
        <h3 className="text-sm font-semibold">{TRACE_STEP_LABELS[event.step] ?? event.step}</h3>
        <span className="text-muted-foreground text-xs">
          第 {event.round} 轮 · {TRACE_STATUS_LABELS[event.status] ?? event.status}
        </span>
        {seconds !== undefined && <span className="text-muted-foreground ml-auto text-xs tabular-nums">耗时 {formatSeconds(seconds)}</span>}
      </div>
      <StepBody event={event} chunks={chunks} />
    </li>
  );
}

function Summary({ trace }: { trace: AgentTraceEvent[] }) {
  const verdict = deriveVerdict(trace, "");
  if (!verdict) return null;
  const total = totalSeconds(trace);
  const searched = verdict.queries.map((query) => `「${query}」`).join("、");
  const outcome = {
    verified: "一次检索就找到了足够的资料，回答通过核对。",
    corrected: "第一次的结果不理想，系统自行纠正后，回答通过了核对。",
    partial: "资料只覆盖了问题的一部分，只给出了有依据的内容。",
    abstained: "资料里没有足够的依据，所以没有作答。",
    unchecked: "这条回答没有完成完整核对。",
  }[verdict.kind];
  return (
    <div className="bg-muted/50 space-y-1.5 rounded-xl p-3 text-sm leading-relaxed">
      <p className="font-semibold">一句话总结</p>
      <p>
        系统搜索了 {verdict.searches} 次{searched ? `（${searched}）` : ""}。{outcome}
        {total !== undefined && `（整个过程约 ${formatSeconds(total)}）`}
      </p>
      {verdict.reason && (
        <p className="text-muted-foreground">
          <CircleAlert className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
          {verdict.reason}
        </p>
      )}
    </div>
  );
}

/** Full, step-by-step account of how one answer was produced: what was searched, found, judged and why. */
export function TraceDetailSheet() {
  const messageId = useTraceDetailStore((state) => state.messageId);
  const close = useTraceDetailStore((state) => state.close);
  const messages = useChatStore((state) => state.messages);

  useEffect(() => {
    if (!messageId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [messageId, close]);

  const index = messages.findIndex((message) => message.id === messageId);
  const message = index >= 0 ? messages[index] : undefined;
  const trace = message?.agentTrace ?? [];
  const question = (() => {
    for (let i = index - 1; i >= 0; i--) if (messages[i]?.role === "user") return messages[i]!.content;
    return undefined;
  })();

  // Each judgement refers to the chunks of the most recent search before it.
  let latestChunks: RetrievedChunk[] = [];
  const cards = trace.map((event, i) => {
    if (event.step === "retrieve") latestChunks = chunksOf(event.detail);
    return <StepCard key={`${i}-${event.step}`} event={event} index={i} chunks={latestChunks} seconds={stepSeconds(trace, i)} />;
  });

  return (
    <Sheet open={Boolean(message)} onOpenChange={(open) => !open && close()}>
      <SheetContent side="right" className="w-full max-w-2xl">
        <SheetHeader>
          <div className="min-w-0">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Search className="h-4 w-4" />
              详细运作过程
            </SheetTitle>
            {question && <p className="text-muted-foreground mt-0.5 truncate text-xs">针对：{question}</p>}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="关闭"
            className="text-muted-foreground hover:text-foreground flex h-9 w-9 items-center justify-center rounded-md"
          >
            <X className="h-5 w-5" />
          </button>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          <Summary trace={trace} />
          <ol className="before:bg-border relative space-y-6 before:absolute before:top-3 before:bottom-3 before:left-[13px] before:w-px">
            {cards}
          </ol>
          <p className="text-muted-foreground text-center text-xs">
            这些记录由系统在回答时实时保存，不是事后编写的说明。
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
