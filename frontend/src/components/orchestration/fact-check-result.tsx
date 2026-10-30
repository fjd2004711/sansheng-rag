"use client";

import { CLAIM_LEVEL_LABELS } from "@/lib/claims";
import { cn } from "@/lib/utils";
import type { FactCheckResult as Result } from "@/types/orchestration";

import { LEVEL_STYLE } from "./meta";

/** The fact-check scenario's deliverable: the checked text and one verdict card per claim. */
export function FactCheckResult({ result }: { result: Result }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-6 py-10 sm:px-10">
        <header className="space-y-3">
          <p className="text-muted-foreground text-xs font-medium tracking-wide">事实核查</p>
          <h1 className="text-2xl font-semibold tracking-tight">逐条核查结果</h1>
          <blockquote className="bg-card text-muted-foreground rounded-xl border p-4 text-sm leading-relaxed">
            {result.text}
          </blockquote>
        </header>
        <ul className="space-y-3">
          {result.claims.map((c, i) => (
            <li key={i} className="bg-card rounded-xl border p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
                    LEVEL_STYLE[c.level],
                  )}
                >
                  {CLAIM_LEVEL_LABELS[c.level]}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm leading-relaxed font-medium">{c.claim}</p>
                  <p className="text-muted-foreground text-xs leading-relaxed">{c.reason}</p>
                  {c.citation_indices.length > 0 && (
                    <p className="text-muted-foreground text-xs">
                      依据：{c.citation_indices.map((n) => `[${n}]`).join(" ")}
                    </p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
        <details className="text-xs">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer font-medium">
            参考来源（{result.sources.length}）
          </summary>
          <ul className="mt-2 space-y-1">
            {result.sources.map((s) => (
              <li key={s.index} className="text-muted-foreground truncate">
                [{s.index}] {s.title} — {s.domain}
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
}
