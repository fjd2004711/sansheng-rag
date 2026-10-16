import type { AgentTraceEvent } from "@/types";

export type ClaimLevel = "verified" | "single_source" | "disputed" | "unverified";

export interface Claim {
  claim: string;
  supported: boolean;
  reason?: string;
  citation_indices?: number[];
  /** Research mode: confidence graded from the sources (see backend research/audit.py). */
  level?: ClaimLevel;
  /** Research mode: sources that state something different. */
  contradicting?: number[];
  /** Research mode: independent sites backing the claim. */
  domains?: string[];
  /** Time-sensitive claim whose newest source is undated or over a year old. */
  stale?: boolean;
}

export const CLAIM_LEVEL_LABELS: Record<ClaimLevel, string> = {
  verified: "已核实",
  single_source: "单一来源",
  disputed: "有争议",
  unverified: "未能核实",
};

/** The claim-by-claim check of the answer that was finally shown (last verification step), if any. */
export function finalClaims(trace: AgentTraceEvent[] | undefined): Claim[] {
  if (!trace) return [];
  for (let i = trace.length - 1; i >= 0; i--) {
    const event = trace[i]!;
    // Research mode grades claims against the sources after verification; that grading is the final word.
    if (event.step !== "answer_verify" && event.step !== "answer_reverify" && event.step !== "claim_audit") continue;
    const claims = event.detail.claims;
    if (Array.isArray(claims)) {
      return (claims as Claim[]).filter((c) => c && typeof c.claim === "string");
    }
  }
  return [];
}

/** A citation is "bad" when any claim leaning on it is unsupported; "ok" when it only backs supported claims. */
export function citationStatus(claims: Claim[]): Map<number, "ok" | "bad"> {
  const status = new Map<number, "ok" | "bad">();
  for (const claim of claims) {
    for (const index of claim.citation_indices ?? []) {
      if (!claim.supported) status.set(index, "bad");
      else if (!status.has(index)) status.set(index, "ok");
    }
  }
  return status;
}
