"use client";

import { ExternalLink } from "lucide-react";

import { CLAIM_LEVEL_LABELS, type Claim } from "@/lib/claims";
import { pagesOf, searchQueriesOf } from "@/lib/research-trace";
import type { AgentTraceEvent } from "@/types";

/** Detail of one research-mode step: what was searched, which pages were read, where evidence came from. */
export function ResearchStepBody({ event }: { event: AgentTraceEvent }) {
  const d = event.detail;
  switch (event.step) {
    case "research_plan":
    case "web_search": {
      const queries = searchQueriesOf(d);
      return (
        <ul className="space-y-1 text-sm">
          {queries.map((q) => (
            <li key={q.query} className="flex items-center justify-between gap-2">
              <span className="bg-muted rounded px-1.5 py-0.5 font-medium">{q.query}</span>
              {event.step === "web_search" && (
                <span className="text-muted-foreground shrink-0 text-xs">{q.failed ? "搜索失败" : `${q.hits} 条结果`}</span>
              )}
            </li>
          ))}
        </ul>
      );
    }
    case "web_fetch":
      return (
        <ul className="space-y-1.5 text-sm">
          {pagesOf(d).map((page) => (
            <li key={page.url} className="flex items-start justify-between gap-2">
              <a
                href={page.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary inline-flex min-w-0 items-start gap-1 underline-offset-2 hover:underline"
              >
                <span className="truncate">{page.title || page.domain}</span>
                <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
              </a>
              <span className="text-muted-foreground shrink-0 text-xs">
                {page.domain} · {page.fullText ? "已读全文" : "仅摘要"}
              </span>
            </li>
          ))}
        </ul>
      );
    case "web_evidence": {
      const domains = Array.isArray(d.domains) ? d.domains.map(String) : [];
      return (
        <p className="text-sm">
          共 {typeof d.count === "number" ? d.count : 0} 段证据，来源网站：
          <span className="text-muted-foreground">{domains.join("、") || "无"}</span>
        </p>
      );
    }
    case "claim_audit":
    case "corroborate": {
      const claims = (Array.isArray(d.claims) ? d.claims : []) as Claim[];
      const queries = event.step === "corroborate" && Array.isArray(d.queries) ? d.queries.map(String) : [];
      return (
        <div className="space-y-2 text-sm">
          <ul className="space-y-1.5">
            {claims.map((claim, i) => (
              <li key={i}>
                <span className="text-muted-foreground mr-1.5 text-xs">
                  [{claim.level ? CLAIM_LEVEL_LABELS[claim.level] : "?"}]
                </span>
                {claim.claim}
                {claim.reason && <span className="text-muted-foreground block text-xs">{claim.reason}</span>}
              </li>
            ))}
          </ul>
          {queries.length > 0 && (
            <p className="text-muted-foreground text-xs">补搜：{queries.map((q) => `「${q}」`).join("、")}</p>
          )}
        </div>
      );
    }
    default:
      return null;
  }
}
