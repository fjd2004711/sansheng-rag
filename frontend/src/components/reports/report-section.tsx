"use client";

import { MarkdownContent } from "@/components/chat/markdown-content";
import { CLAIM_LEVEL_LABELS, type ClaimLevel } from "@/lib/claims";
import type { ReportSectionData, ReportSource } from "@/types/report";

import { ReportChart } from "./report-chart";

/** Clickable [n] citations that jump to the reference list, with the source title on hover. */
export function useCitations(sources: ReportSource[]) {
  return {
    onCiteClick: (n: number) =>
      document.getElementById(`ref-${n}`)?.scrollIntoView({ behavior: "smooth", block: "center" }),
    citeTitle: (n: number) => {
      const source = sources.find((s) => s.index === n);
      return source ? `${source.title}（${source.domain}）` : undefined;
    },
  };
}

export function ReportSection({
  section,
  sources,
}: {
  section: ReportSectionData;
  sources: ReportSource[];
}) {
  const cite = useCitations(sources);
  const counts = (Object.keys(CLAIM_LEVEL_LABELS) as ClaimLevel[])
    .map((level) => [level, section.claims.filter((c) => c.level === level).length] as const)
    .filter(([, n]) => n > 0);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xl font-semibold tracking-tight">{section.heading}</h3>
        {counts.length > 0 && (
          <span className="text-muted-foreground text-xs">
            核验：{counts.map(([level, n]) => `${CLAIM_LEVEL_LABELS[level]} ${n}`).join(" · ")}
          </span>
        )}
      </div>
      <div className="prose-sm max-w-none text-sm">
        <MarkdownContent content={section.body} {...cite} />
      </div>
      {section.table && (
        <div className="overflow-x-auto">
          <p className="mb-1 text-sm font-medium">{section.table.caption}</p>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-muted/60">
                {section.table.columns.map((column) => (
                  <th key={column} className="border px-2 py-1.5 text-left font-medium">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.table.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} className="border px-2 py-1.5 align-top tabular-nums">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-muted-foreground mt-1 text-xs">表中每个数字都已与来源原文逐字核对。</p>
        </div>
      )}
      {section.chart && <ReportChart chart={section.chart} />}
      {section.analysis && (
        <div className="bg-muted/40 rounded-lg border-l-4 border-sky-500/60 p-3">
          <p className="mb-1 text-xs font-medium text-sky-700 dark:text-sky-400">
            分析（基于上述数据的解读，带“可能/推测”的是判断而非事实）
          </p>
          <div className="prose-sm max-w-none text-sm">
            <MarkdownContent content={section.analysis} {...cite} />
          </div>
        </div>
      )}
    </section>
  );
}
