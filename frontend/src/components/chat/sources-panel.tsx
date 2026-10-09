"use client";

import { useEffect, useRef } from "react";
import { FileText, Globe, Link, X } from "lucide-react";
import { useSourcesPanelStore } from "@/stores/sources-panel-store";
import type { SourceItem } from "@/lib/chat-sources";
import { cn } from "@/lib/utils";

const SCORE_LABELS: Record<string, string> = {
  dense_score: "语义相似",
  bm25_score: "关键词匹配",
  rrf_score: "综合排名",
  reranker_score: "精排得分",
};

function ScoreDot({ score }: { score: number }) {
  const tone =
    score >= 0.7 ? "bg-foreground" : score >= 0.4 ? "bg-foreground/55" : "bg-foreground/25";
  return (
    <span
      className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone)}
      title={`相关度：${score.toFixed(2)}`}
    />
  );
}

function RAGSourceRow({
  item,
  highlighted,
}: {
  item: SourceItem;
  highlighted: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlighted) {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [highlighted]);

  return (
    <div
      ref={ref}
      className={cn(
        "border-foreground/8 rounded-xl border p-3 transition-colors",
        highlighted && "border-foreground/30 bg-foreground/[0.04]",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="bg-foreground/8 text-foreground/65 mt-0.5 inline-flex h-5 min-w-[1.5rem] shrink-0 items-center justify-center rounded px-1 font-mono text-[10px] tabular-nums">
          {item.index}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <FileText className="text-foreground/40 h-3.5 w-3.5 shrink-0" />
            <p className="text-foreground truncate text-xs font-medium" title={item.title}>
              {item.title}
            </p>
            {item.score !== undefined && <ScoreDot score={item.score} />}
          </div>
          {item.subtitle && (
            <p className="text-foreground/45 mt-0.5 pl-5 font-mono text-[10px] tracking-wider uppercase">
              {item.subtitle}
            </p>
          )}
          {item.componentScores && Object.keys(item.componentScores).length > 0 && (
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 pl-5 text-[11px] text-muted-foreground">
              {Object.entries(item.componentScores).map(([name, value]) => (
                <div key={name} className="flex justify-between gap-2"><dt>{SCORE_LABELS[name] ?? name}</dt><dd>{value.toFixed(3)}</dd></div>
              ))}
            </dl>
          )}
          {item.content && (
            <p className="text-foreground/60 mt-2 pl-5 text-[11px] leading-relaxed">
              {item.content}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function WebSourceRow({
  item,
  highlighted,
}: {
  item: SourceItem;
  highlighted: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlighted) {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [highlighted]);

  const inner = (
    <div
      ref={ref}
      className={cn(
        "border-foreground/8 rounded-xl border p-3 transition-colors",
        highlighted && "border-foreground/30 bg-foreground/[0.04]",
        item.url && "hover:border-foreground/25 cursor-pointer",
      )}
    >
      <div className="flex items-start gap-2.5">
        <Globe className="text-foreground/40 mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-foreground truncate text-xs font-medium" title={item.title}>
            {item.title}
          </p>
          {item.subtitle && (
            <div className="text-foreground/45 mt-0.5 flex items-center gap-1 text-[10px]">
              <Link className="h-2.5 w-2.5 shrink-0" />
              {item.subtitle}
            </div>
          )}
          {item.content && (
            <p className="text-foreground/60 mt-2 line-clamp-3 text-[11px] leading-relaxed">
              {item.content}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  if (item.url) {
    return (
      <a href={item.url} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    );
  }
  return inner;
}

export function SourcesPanel() {
  const { isOpen, sources, highlightedIndex, claim, close } = useSourcesPanelStore();

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  if (!isOpen) return null;

  const ragSources = sources.filter((s) => s.type === "rag");
  const webSources = sources.filter((s) => s.type === "web");

  return (
    <div className="bg-background border-border fixed top-0 right-0 z-50 flex h-full w-[360px] flex-col border-l shadow-xl">
      {/* Header */}
      <div className="border-foreground/8 flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-foreground text-sm font-semibold">
          依据来源
          <span className="text-foreground/45 ml-2 font-normal">({sources.length})</span>
        </h2>
        <button
          type="button"
          onClick={close}
          aria-label="关闭来源面板"
          className="text-foreground/50 hover:text-foreground hover:bg-foreground/8 rounded-md p-1 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {claim && (
        <div className="border-foreground/8 bg-muted/40 border-b px-4 py-2.5 text-xs leading-relaxed">
          <p className="text-foreground/45 mb-0.5 font-mono text-[10px] tracking-wider uppercase">回答里的这句话</p>
          {claim}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {ragSources.length > 0 && (
          <section className="space-y-2">
            {ragSources.length > 0 && webSources.length > 0 && (
              <h3 className="text-foreground/45 font-mono text-[10px] tracking-wider uppercase">
                知识库
              </h3>
            )}
            {ragSources.map((s) => (
              <RAGSourceRow
                key={`rag-${s.index}`}
                item={s}
                highlighted={s.index === highlightedIndex}
              />
            ))}
          </section>
        )}

        {webSources.length > 0 && (
          <section className="space-y-2">
            {ragSources.length > 0 && (
              <h3 className="text-foreground/45 font-mono text-[10px] tracking-wider uppercase">
                网页
              </h3>
            )}
            {webSources.map((s) => (
              <WebSourceRow
                key={`web-${s.index}`}
                item={s}
                highlighted={s.index === highlightedIndex}
              />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
