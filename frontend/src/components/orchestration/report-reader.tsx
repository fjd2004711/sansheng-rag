"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText } from "lucide-react";

import { MarkdownContent } from "@/components/chat/markdown-content";
import { ReportAdvice } from "@/components/reports/report-advice";
import { ReportAppendix } from "@/components/reports/report-appendix";
import { ReportSection, useCitations } from "@/components/reports/report-section";
import { CLAIM_LEVEL_LABELS, type ClaimLevel } from "@/lib/claims";
import { cn } from "@/lib/utils";
import type { ReportDocument } from "@/types/report";

import { LEVEL_STYLE } from "./meta";

/** The report as a reading page: table of contents on the left, a comfortable column, claims counted by level. */
export function ReportReader({
  report,
  downloadBase,
}: {
  report: ReportDocument;
  downloadBase: string;
}) {
  const cite = useCitations(report.sources);
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState("sec-summary");

  const claims = useMemo(
    () => [
      ...report.summary_claims,
      ...report.sections.flatMap((s) => s.claims),
      ...(report.insight_claims ?? []),
      ...(report.recommendations ?? []).flatMap((r) => r.premises),
    ],
    [report],
  );
  const counts = (Object.keys(CLAIM_LEVEL_LABELS) as ClaimLevel[])
    .map((level) => [level, claims.filter((c) => c.level === level).length] as const)
    .filter(([, n]) => n > 0);

  const toc = useMemo(
    () => [
      { id: "sec-summary", label: "核心结论" },
      ...report.sections.map((s, i) => ({ id: `sec-${i}`, label: s.heading })),
      ...(report.insights?.trim() || report.recommendations?.length
        ? [{ id: "sec-synthesis", label: "综合研判与行动建议" }]
        : []),
      { id: "sec-caveats", label: "争议与不确定" },
      { id: "sec-sources", label: "附录：核实表与来源" },
    ],
    [report],
  );

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { root, rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );
    toc.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [toc]);

  const go = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="flex h-full min-h-0">
      <nav
        className="bg-card/50 hidden w-60 shrink-0 overflow-y-auto border-r p-4 lg:block"
        aria-label="报告目录"
      >
        <p className="text-muted-foreground mb-2 px-2 text-[11px] font-medium tracking-wide">
          目录
        </p>
        <ul className="space-y-0.5">
          {toc.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => go(item.id)}
                className={cn(
                  "w-full rounded-md px-2 py-1.5 text-left text-xs leading-snug transition-colors",
                  active === item.id
                    ? "bg-foreground/8 text-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div ref={scroller} className="min-w-0 flex-1 overflow-y-auto scroll-smooth">
        <article className="mx-auto max-w-3xl space-y-10 px-6 py-10 sm:px-10">
          <header className="space-y-4">
            <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide">
              <FileText className="h-3.5 w-3.5" />
              调研分析报告
            </div>
            <h1 className="text-3xl leading-tight font-semibold tracking-tight">{report.title}</h1>
            <p className="text-muted-foreground text-xs">
              生成于 {new Date(report.generated_at).toLocaleString("zh-CN")} · 阅读网页{" "}
              {report.method.pages_read} 个 · 数据点 {report.method.data_points_kept}{" "}
              条（均与原文逐字核对）
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {counts.map(([level, n]) => (
                <span
                  key={level}
                  className={cn("rounded-full px-2.5 py-1 text-xs font-medium", LEVEL_STYLE[level])}
                >
                  {CLAIM_LEVEL_LABELS[level]} {n}
                </span>
              ))}
              <span className="text-muted-foreground text-xs">
                共逐条核验 {claims.length} 条说法
              </span>
              <span className="ml-auto flex gap-2">
                {(["docx", "pdf"] as const).map((format) => (
                  <a
                    key={format}
                    href={`${downloadBase}?format=${format}`}
                    className="hover:bg-muted inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {format === "docx" ? "Word" : "PDF"}
                  </a>
                ))}
              </span>
            </div>
          </header>

          <section id="sec-summary" className="scroll-mt-6">
            <h2 className="mb-3 text-xl font-semibold tracking-tight">核心结论</h2>
            <div className="bg-card rounded-xl border p-5 shadow-sm">
              <div className="prose-sm max-w-none text-sm leading-relaxed">
                <MarkdownContent content={report.summary} {...cite} />
              </div>
            </div>
          </section>

          {report.sections.map((section, i) => (
            <div key={section.heading} id={`sec-${i}`} className="scroll-mt-6">
              <ReportSection section={section} sources={report.sources} />
            </div>
          ))}

          <div id="sec-synthesis" className="scroll-mt-6 space-y-8">
            <ReportAdvice report={report} cite={cite} />
          </div>

          <section id="sec-caveats" className="scroll-mt-6">
            <h2 className="mb-3 text-xl font-semibold tracking-tight">争议与不确定</h2>
            {report.caveats.length ? (
              <ul className="space-y-2">
                {report.caveats.map((note, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-amber-500/30 bg-amber-500/6 px-4 py-2.5 text-sm leading-relaxed"
                  >
                    {note}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">
                逐条核验没有发现有争议、未能核实或可能过时的内容。
              </p>
            )}
          </section>

          <div id="sec-sources" className="scroll-mt-6">
            <ReportAppendix report={report} />
          </div>
        </article>
      </div>
    </div>
  );
}
