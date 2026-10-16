"use client";

import { CLAIM_LEVEL_LABELS } from "@/lib/claims";
import { SOURCE_TIER_LABELS } from "@/lib/research-trace";
import type { ReportDocument } from "@/types/report";

/** Claim-by-claim verification, how the report was made, and every source — for anyone checking the report. */
export function ReportAppendix({ report }: { report: ReportDocument }) {
  const rows = [
    ...report.summary_claims.map((claim) => ({ heading: "核心结论", claim })),
    ...report.sections.flatMap((s) => s.claims.map((claim) => ({ heading: s.heading, claim }))),
  ];
  const m = report.method;
  const pages = Object.values(
    report.sources.reduce<
      Record<string, { indices: number[]; source: (typeof report.sources)[number] }>
    >((acc, s) => {
      (acc[s.url] ??= { indices: [], source: s }).indices.push(s.index);
      return acc;
    }, {}),
  );

  return (
    <div className="space-y-4 border-t pt-4 text-sm">
      <details>
        <summary className="cursor-pointer font-semibold">
          附录一：逐条核实表（{rows.length} 条）
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-muted/60">
                {["章节", "说法", "等级", "依据", "说明"].map((c) => (
                  <th key={c} className="border px-2 py-1.5 text-left font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ heading, claim }, i) => (
                <tr key={i}>
                  <td className="border px-2 py-1.5 align-top">{heading}</td>
                  <td className="border px-2 py-1.5 align-top">{claim.claim}</td>
                  <td className="border px-2 py-1.5 align-top whitespace-nowrap">
                    {CLAIM_LEVEL_LABELS[claim.level]}
                    {claim.stale && "（可能过时）"}
                  </td>
                  <td className="border px-2 py-1.5 align-top">
                    {claim.citation_indices.map((n) => `[${n}]`).join("") || "—"}
                  </td>
                  <td className="text-muted-foreground border px-2 py-1.5 align-top">
                    {claim.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <details>
        <summary className="cursor-pointer font-semibold">附录二：方法说明</summary>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5">
          <li>检索词：{m.queries.join("；")}</li>
          <li>
            阅读网页 {m.pages_read} 个（读到全文 {m.full_text_pages} 个）；来源等级：
            {Object.entries(m.sources_by_tier)
              .map(([tier, n]) => `${SOURCE_TIER_LABELS[tier] ?? tier} ${n}`)
              .join("、")}
          </li>
          <li>
            数据点保留 {m.data_points_kept} 条（引用原句与来源逐字一致），剔除{" "}
            {m.data_points_rejected} 条无法核对的数据。
          </li>
          <li>
            等级规则：已核实＝权威来源全文支持，或两个以上独立网站一致；单一来源＝只有一个网站或只有低可信来源；有争议＝可信来源说法不同；未能核实＝没有资料支持。
          </li>
          <li>生成模型：{m.model}</li>
        </ul>
      </details>
      <section>
        <h3 className="mb-2 font-semibold">参考来源</h3>
        <ol className="space-y-1.5">
          {pages.map(({ indices, source }) => (
            <li key={source.url} id={`ref-${indices[0]}`} className="scroll-mt-24">
              {indices.slice(1).map((n) => (
                <span key={n} id={`ref-${n}`} />
              ))}
              <span className="font-mono text-xs">{indices.map((n) => `[${n}]`).join("")}</span>{" "}
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-2 hover:underline"
              >
                {source.title || source.domain}
              </a>
              <span className="text-muted-foreground text-xs">
                {" "}
                · {SOURCE_TIER_LABELS[source.tier] ?? source.tier} · {source.domain}
                {source.published_at && ` · 发布 ${source.published_at}`}
                {source.from_snippet && " · 仅搜索摘要"}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
