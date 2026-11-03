"use client";

import { AlertTriangle, Check, ChevronDown, CircleHelp, Clock, Info, X } from "lucide-react";

import { CLAIM_LEVEL_LABELS, type Claim, type ClaimLevel } from "@/lib/claims";
import type { SourceItem } from "@/lib/chat-sources";
import { useSourcesPanelStore } from "@/stores/sources-panel-store";
import { cn } from "@/lib/utils";

const LEVEL_STYLE: Record<ClaimLevel, { icon: typeof Check; className: string }> = {
  verified: { icon: Check, className: "text-emerald-600" },
  single_source: { icon: Info, className: "text-sky-600" },
  disputed: { icon: AlertTriangle, className: "text-amber-600" },
  unverified: { icon: CircleHelp, className: "text-red-500" },
};

function summaryText(claims: Claim[]): string {
  if (claims.some((claim) => claim.level)) {
    const counts = (Object.keys(CLAIM_LEVEL_LABELS) as ClaimLevel[])
      .map((level) => [level, claims.filter((claim) => claim.level === level).length] as const)
      .filter(([, n]) => n > 0)
      .map(([level, n]) => `${CLAIM_LEVEL_LABELS[level]} ${n}`);
    return `逐条核验：${claims.length} 条说法，${counts.join("，")}`;
  }
  const supported = claims.filter((claim) => claim.supported).length;
  const missing = claims.length - supported;
  return `逐条核对：${claims.length} 条说法，${supported} 条有资料依据${missing ? `，${missing} 条没有` : ""}`;
}

/** Every statement in the answer, how well the sources back it, and which source — click a number to read it. */
export function ClaimChecklist({ claims, sources }: { claims: Claim[]; sources: SourceItem[] }) {
  const openSources = useSourcesPanelStore((state) => state.open);
  if (claims.length === 0) return null;
  const allGood = claims.every((claim) => (claim.level ? claim.level === "verified" : claim.supported));

  const sourceButtons = (claim: Claim, indices: number[] | undefined, against = false) =>
    (indices ?? []).map((n) => (
      <button
        key={`${against ? "x" : "s"}${n}`}
        type="button"
        disabled={!sources.some((source) => source.index === n)}
        onClick={() => openSources(sources, n, claim.claim)}
        className={cn(
          "rounded px-1.5 py-0.5 font-mono text-[11px] tabular-nums disabled:opacity-40",
          against ? "bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-400" : "bg-foreground/10 hover:bg-foreground/20",
        )}
        title={against ? "这份资料的说法不同，点开对照原文" : "查看这条说法依据的原文"}
      >
        {against ? "不同说法" : "来源"} {n}
      </button>
    ));

  return (
    <details className="border-foreground/30 group w-full border-y text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-1 py-2 select-none">
        <span className={cn("flex h-5 w-5 items-center justify-center border-[1.5px]", allGood ? "border-emerald-600/70 text-emerald-600" : "border-amber-600/70 text-amber-600")}>
          {allGood ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
        </span>
        <span className="font-display text-[14px] font-bold">{summaryText(claims)}</span>
        <ChevronDown className="text-muted-foreground ml-auto h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <ul className="border-foreground/15 space-y-2.5 border-t px-1 py-3">
        {claims.map((claim, index) => {
          const style = claim.level ? LEVEL_STYLE[claim.level] : claim.supported ? LEVEL_STYLE.verified : LEVEL_STYLE.unverified;
          const Icon = style.icon;
          return (
            <li key={index} className="flex gap-2">
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", style.className)} />
              <div className="min-w-0 flex-1">
                <p className={cn(!claim.supported && "text-red-600 dark:text-red-400")}>
                  {claim.level && (
                    <span className={cn("mr-1.5 text-xs font-medium", style.className)}>[{CLAIM_LEVEL_LABELS[claim.level]}]</span>
                  )}
                  {claim.claim}
                </p>
                {claim.reason && <p className="text-muted-foreground text-xs">{claim.reason}</p>}
                {claim.stale && (
                  <p className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                    <Clock className="h-3 w-3" />
                    可能过时
                  </p>
                )}
                {((claim.citation_indices?.length ?? 0) > 0 || (claim.contradicting?.length ?? 0) > 0) && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {sourceButtons(claim, claim.citation_indices)}
                    {sourceButtons(claim, claim.contradicting, true)}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
