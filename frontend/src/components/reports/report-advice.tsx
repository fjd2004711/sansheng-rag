"use client";

import { MarkdownContent } from "@/components/chat/markdown-content";
import type { RecommendationBasis, ReportDocument } from "@/types/report";

import type { useCitations } from "./report-section";

const BASIS: Record<RecommendationBasis, { label: string; className: string }> = {
  strong: {
    label: "依据充分",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  mixed: { label: "依据一般", className: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  weak: { label: "依据不足", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  inference: { label: "推断", className: "bg-muted text-muted-foreground" },
};

const BASIS_HINT: Record<RecommendationBasis, string> = {
  strong: "所依据的事实均已核实",
  mixed: "部分事实只有单一来源",
  weak: "所依据的事实含未核实或有争议的部分",
  inference: "没有可单独核验的事实前提",
};

const PRIORITY_CLASS = {
  高: "bg-red-500/15 text-red-700 dark:text-red-400",
  中: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  低: "bg-muted text-muted-foreground",
} as const;

/** 综合研判 + 行动建议: judgments drawn from the sections, each tagged with how well its facts were verified. */
export function ReportAdvice({
  report,
  cite,
}: {
  report: ReportDocument;
  cite: ReturnType<typeof useCitations>;
}) {
  const recommendations = report.recommendations ?? [];
  if (!report.insights?.trim() && recommendations.length === 0) return null;

  return (
    <>
      {report.insights?.trim() && (
        <section className="space-y-2">
          <h3 className="text-xl font-semibold tracking-tight">综合研判</h3>
          {report.audience && (
            <p className="text-muted-foreground text-xs">写给：{report.audience}</p>
          )}
          <div className="prose-sm max-w-none text-sm">
            <MarkdownContent content={report.insights} {...cite} />
          </div>
        </section>
      )}
      {recommendations.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xl font-semibold tracking-tight">行动建议</h3>
          <p className="text-muted-foreground text-xs">
            以下是基于上文事实的推论和建议，不是来源原文的结论；每条标明了它所依据事实的核实程度。
          </p>
          <ol className="space-y-3">
            {recommendations.map((rec, i) => (
              <li key={i} className="bg-muted/40 space-y-1.5 rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {i + 1}. {rec.action}
                  </span>
                  <span className={`rounded px-1.5 py-0.5 text-xs ${PRIORITY_CLASS[rec.priority]}`}>
                    {rec.priority}优先级
                  </span>
                  <span
                    title={BASIS_HINT[rec.basis]}
                    className={`rounded px-1.5 py-0.5 text-xs ${BASIS[rec.basis].className}`}
                  >
                    {BASIS[rec.basis].label}
                  </span>
                </div>
                {rec.reason && (
                  <div className="prose-sm max-w-none">
                    <span className="text-muted-foreground text-xs">依据：</span>
                    <MarkdownContent content={rec.reason} {...cite} />
                  </div>
                )}
                {rec.caveat && (
                  <p className="text-muted-foreground text-xs">前提与风险：{rec.caveat}</p>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
