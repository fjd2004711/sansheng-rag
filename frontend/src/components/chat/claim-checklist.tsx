"use client";

import { Check, ChevronDown, X } from "lucide-react";

import type { Claim } from "@/lib/claims";
import type { SourceItem } from "@/lib/chat-sources";
import { useSourcesPanelStore } from "@/stores/sources-panel-store";
import { cn } from "@/lib/utils";

/** Every statement in the answer, whether the sources back it, and which source — click a number to read it. */
export function ClaimChecklist({ claims, sources }: { claims: Claim[]; sources: SourceItem[] }) {
  const openSources = useSourcesPanelStore((state) => state.open);
  if (claims.length === 0) return null;
  const supported = claims.filter((claim) => claim.supported).length;
  const allGood = supported === claims.length;

  return (
    <details className="border-border group w-full rounded-xl border text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 select-none">
        <span className={cn("flex h-5 w-5 items-center justify-center rounded-full", allGood ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600")}>
          {allGood ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
        </span>
        <span className="font-medium">
          逐条核对：{claims.length} 条说法，{supported} 条有资料依据
          {!allGood && `，${claims.length - supported} 条没有`}
        </span>
        <ChevronDown className="text-muted-foreground ml-auto h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <ul className="space-y-2 border-t px-3 py-2.5">
        {claims.map((claim, index) => (
          <li key={index} className="flex gap-2">
            {claim.supported ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <X className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            )}
            <div className="min-w-0 flex-1">
              <p className={cn(!claim.supported && "text-red-600 dark:text-red-400")}>{claim.claim}</p>
              {claim.reason && <p className="text-muted-foreground text-xs">{claim.reason}</p>}
              {(claim.citation_indices?.length ?? 0) > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {claim.citation_indices!.map((n) => (
                    <button
                      key={n}
                      type="button"
                      disabled={!sources.some((source) => source.index === n)}
                      onClick={() => openSources(sources, n, claim.claim)}
                      className="bg-foreground/10 hover:bg-foreground/20 rounded px-1.5 py-0.5 font-mono text-[11px] tabular-nums disabled:opacity-40"
                      title="查看这条说法依据的原文"
                    >
                      来源 {n}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}
