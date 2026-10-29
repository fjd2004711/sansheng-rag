"use client";

import { ReportBody } from "@/components/reports/report-view";
import { CLAIM_LEVEL_LABELS } from "@/lib/claims";
import type { RunResult } from "@/types/orchestration";

/** The run's deliverable: a full report, or a fact-check table, depending on the scenario. */
export function RunResult({ id, result }: { id: string; result: RunResult }) {
  if (result.kind === "report") {
    return (
      <ReportBody
        id={id}
        report={result.report}
        downloadBase={`/api/v1/orchestration/runs/${id}/download`}
      />
    );
  }
  return (
    <div className="bg-card space-y-3 rounded-xl border p-4">
      <h3 className="text-lg font-semibold">逐条核查结果</h3>
      <blockquote className="text-muted-foreground border-l-4 pl-3 text-sm">
        {result.text}
      </blockquote>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-muted/60">
              {["说法", "等级", "依据", "说明"].map((h) => (
                <th key={h} className="border px-2 py-1.5 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.claims.map((c, i) => (
              <tr key={i}>
                <td className="border px-2 py-1.5 align-top">{c.claim}</td>
                <td className="border px-2 py-1.5 align-top whitespace-nowrap">
                  {CLAIM_LEVEL_LABELS[c.level]}
                </td>
                <td className="border px-2 py-1.5 align-top">
                  {c.citation_indices.map((n) => `[${n}]`).join("") || "—"}
                </td>
                <td className="border px-2 py-1.5 align-top">{c.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer">参考来源（{result.sources.length}）</summary>
        <ul className="mt-1 space-y-0.5">
          {result.sources.map((s) => (
            <li key={s.index}>
              [{s.index}] {s.title} — {s.url}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
