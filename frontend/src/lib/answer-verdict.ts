import type { AgentTraceEvent } from "@/types";

export type VerdictKind = "verified" | "corrected" | "partial" | "abstained" | "unchecked";

export interface AnswerVerdict {
  kind: VerdictKind;
  /** 0..1 from the last verification step, when present. */
  groundedness?: number;
  /** Distinct [n] markers in the answer text. */
  citations: number;
  /** Retrieval rounds actually run (initial search + re-searches). */
  searches: number;
  /** How many times the system re-phrased the search. */
  rewrites: number;
  /** Queries the system tried, in order, without duplicates. */
  queries: string[];
}

const CORRECTION_STEPS = new Set(["query_rewrite", "regenerate", "retrieve_missing"]);

/** Summarise a finished answer's trace into one trust verdict for the UI. Null when nothing was traced. */
export function deriveVerdict(
  trace: AgentTraceEvent[] | undefined,
  content: string,
): AnswerVerdict | null {
  if (!trace || trace.length === 0) return null;

  const queries: string[] = [];
  for (const event of trace) {
    const query = event.step === "retrieve" || event.step === "retrieve_missing" ? event.detail.query : undefined;
    if (typeof query === "string" && query && !queries.includes(query)) queries.push(query);
  }
  const verifications = trace.filter((e) => e.step === "answer_verify" || e.step === "answer_reverify");
  const lastVerify = verifications[verifications.length - 1];
  const groundedness =
    typeof lastVerify?.detail.groundedness === "number" ? lastVerify.detail.groundedness : undefined;

  let kind: VerdictKind = "unchecked";
  if (trace.some((e) => e.step === "partial_answer")) kind = "partial";
  else if (trace.some((e) => e.step === "abstain")) kind = "abstained";
  else if (lastVerify?.status === "PASS") kind = trace.some((e) => CORRECTION_STEPS.has(e.step)) ? "corrected" : "verified";

  return {
    kind,
    groundedness,
    citations: new Set(content.match(/\[(\d{1,3})\]/g) ?? []).size,
    searches: trace.filter((e) => e.step === "retrieve" || e.step === "retrieve_missing").length,
    rewrites: trace.filter((e) => e.step === "query_rewrite").length,
    queries,
  };
}
