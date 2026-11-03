"use client";

import { Download } from "lucide-react";

import { MarkdownContent } from "@/components/chat/markdown-content";
import { Progress } from "@/components/ui";
import { useReport } from "@/hooks/use-reports";
import { CLAIM_LEVEL_LABELS, type ClaimLevel } from "@/lib/claims";
import type { ReportDocument, ReportSummary } from "@/types/report";

import { ReportAdvice } from "./report-advice";
import { ReportAppendix } from "./report-appendix";
import { ReportDiagrams } from "./report-diagrams";
import { ReportSection, useCitations } from "./report-section";

export function ReportView({ summary }: { summary: ReportSummary }) {
  const detail = useReport(summary.id, summary.status);
  const report = detail?.report;

  if (summary.status !== "done" || !report) {
    return (
      <div className="bg-card space-y-3 rounded-xl border p-6">
        <h2 className="text-lg font-semibold">{summary.title || summary.topic}</h2>
        {summary.status === "failed" ? (
          <p className="text-sm text-red-600">{summary.error || "生成失败"}</p>
        ) : (
          <>
            <Progress value={summary.progress} className="h-2" />
            <p className="text-muted-foreground text-sm">
              {summary.stage || "排队中"}（{summary.progress}%）
            </p>
            <p className="text-muted-foreground text-xs">
              生成过程：规划提纲 → 搜索并阅读权威资料 → 摘取并逐字核对数据 → 撰写各章并逐条核验 →
              为存疑说法补找来源 → 核心结论 → 综合研判与行动建议
            </p>
          </>
        )}
      </div>
    );
  }
  return <ReportBody id={summary.id} report={report} />;
}

export function ReportBody({
  id,
  report,
  downloadBase,
}: {
  id: string;
  report: ReportDocument;
  /** Where the Word / PDF files come from; defaults to the report's own endpoint. */
  downloadBase?: string;
}) {
  const cite = useCitations(report.sources);
  const claims = [
    ...report.summary_claims,
    ...report.sections.flatMap((s) => s.claims),
    ...(report.insight_claims ?? []),
    ...(report.recommendations ?? []).flatMap((r) => r.premises),
  ];
  const counts = (Object.keys(CLAIM_LEVEL_LABELS) as ClaimLevel[])
    .map((level) => [level, claims.filter((c) => c.level === level).length] as const)
    .filter(([, n]) => n > 0);

  return (
    <article className="bg-card space-y-6 rounded-xl border p-4 sm:p-8">
      <header className="space-y-3 border-b pb-4">
        <h2 className="text-xl font-semibold sm:text-2xl">{report.title}</h2>
        <p className="text-muted-foreground text-xs">
          生成于 {new Date(report.generated_at).toLocaleString("zh-CN")} · 阅读网页{" "}
          {report.method.pages_read} 个 · 数据点 {report.method.data_points_kept}{" "}
          条（均与原文逐字核对）
        </p>
        <p className="text-sm">
          逐条核验 {claims.length} 条说法：
          {counts.map(([level, n]) => `${CLAIM_LEVEL_LABELS[level]} ${n}`).join("，") || "无"}
        </p>
        <div className="flex flex-wrap gap-2">
          {(["docx", "pdf"] as const).map((format) => (
            <a
              key={format}
              href={`${downloadBase ?? `/api/v1/reports/${id}/download`}?format=${format}`}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm"
            >
              <Download className="h-4 w-4" />
              下载 {format === "docx" ? "Word" : "PDF"}
            </a>
          ))}
        </div>
      </header>
      <section>
        <h3 className="mb-2 text-lg font-semibold">核心结论</h3>
        <div className="prose-sm max-w-none text-sm">
          <MarkdownContent content={report.summary} {...cite} />
        </div>
      </section>
      <ReportDiagrams diagrams={report.diagrams} />
      {report.sections.map((section) => (
        <ReportSection key={section.heading} section={section} sources={report.sources} />
      ))}
      <ReportAdvice report={report} cite={cite} />
      <section>
        <h3 className="mb-2 text-lg font-semibold">争议与不确定</h3>
        {report.caveats.length ? (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {report.caveats.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            逐条核验没有发现有争议、未能核实或可能过时的内容。
          </p>
        )}
      </section>
      <ReportAppendix report={report} />
    </article>
  );
}
