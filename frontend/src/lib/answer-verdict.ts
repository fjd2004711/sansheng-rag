import { describeFailure } from "@/lib/agent-trace-labels";
import { auditCountsOf, searchQueriesOf } from "@/lib/research-trace";
import type { AgentTraceEvent } from "@/types";

/** "cross_checked": research mode graded every claim against independent web sources. */
export type VerdictKind = "verified" | "corrected" | "partial" | "abstained" | "cross_checked" | "unchecked";

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
  /** Plain-language reason behind a refusal or a partial answer, when there is one. */
  reason?: string;
  /** Research mode: claims per confidence level from the last cross-check. */
  audit?: Record<string, number>;
}

const REASON_STEPS = ["answer_reverify", "answer_verify", "answer_diagnose", "failure_diagnose", "evidence_evaluate"];

/** The most recent explanation of what went wrong, from the last step that gave one. */
function lastReason(trace: AgentTraceEvent[]): string | undefined {
  for (const step of REASON_STEPS) {
    for (let i = trace.length - 1; i >= 0; i--) {
      const event = trace[i]!;
      if (event.step !== step || event.status === "PASS") continue;
      const reason = describeFailure(event.detail);
      if (reason) return reason;
    }
  }
  const abstain = [...trace].reverse().find((event) => event.step === "abstain");
  return abstain ? describeFailure(abstain.detail) : undefined;
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
    if (event.step === "web_search")
      for (const web of searchQueriesOf(event.detail)) if (!queries.includes(web.query)) queries.push(web.query);
  }
  const verifications = trace.filter((e) => e.step === "answer_verify" || e.step === "answer_reverify");
  const lastVerify = verifications[verifications.length - 1];
  const groundedness =
    typeof lastVerify?.detail.groundedness === "number" ? lastVerify.detail.groundedness : undefined;

  const lastAudit = [...trace].reverse().find((e) => e.step === "claim_audit");
  const audit = lastAudit ? auditCountsOf(lastAudit.detail) : undefined;

  let kind: VerdictKind = "unchecked";
  // Research mode never cross-checks an answer it declined to give, so the audit can take precedence.
  if (audit && Object.values(audit).some((n) => n > 0)) kind = "cross_checked";
  else if (trace.some((e) => e.step === "partial_answer")) kind = "partial";
  else if (trace.some((e) => e.step === "abstain")) kind = "abstained";
  else if (lastVerify?.status === "PASS") kind = trace.some((e) => CORRECTION_STEPS.has(e.step)) ? "corrected" : "verified";

  return {
    kind,
    groundedness,
    citations: new Set(content.match(/\[(\d{1,3})\]/g) ?? []).size,
    // In research mode every search (including P3's supplemental one) is a web_search step.
    searches: trace.some((e) => e.step === "web_search")
      ? trace.filter((e) => e.step === "web_search").length
      : trace.filter((e) => e.step === "retrieve" || e.step === "retrieve_missing").length,
    rewrites: trace.filter((e) => e.step === "query_rewrite").length,
    queries,
    reason: kind === "abstained" || kind === "partial" ? lastReason(trace) : undefined,
    audit,
  };
}
