import type { AgentTraceEvent } from "@/types";

export interface Claim {
  claim: string;
  supported: boolean;
  reason?: string;
  citation_indices?: number[];
}

/** The claim-by-claim check of the answer that was finally shown (last verification step), if any. */
export function finalClaims(trace: AgentTraceEvent[] | undefined): Claim[] {
  if (!trace) return [];
  for (let i = trace.length - 1; i >= 0; i--) {
    const event = trace[i]!;
    if (event.step !== "answer_verify" && event.step !== "answer_reverify") continue;
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
