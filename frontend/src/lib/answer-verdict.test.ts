import { describe, expect, it } from "vitest";

import { deriveVerdict } from "./answer-verdict";
import type { AgentTraceEvent } from "@/types";

const ev = (step: string, status: string, detail: Record<string, unknown> = {}): AgentTraceEvent => ({
  step,
  round: 1,
  status,
  detail,
});

describe("deriveVerdict", () => {
  it("returns null when nothing was traced", () => {
    expect(deriveVerdict(undefined, "答案")).toBeNull();
    expect(deriveVerdict([], "答案")).toBeNull();
  });

  it("is verified when the first retrieval and verification pass", () => {
    const verdict = deriveVerdict(
      [ev("retrieve", "COMPLETE", { query: "a" }), ev("evidence_evaluate", "PASS"), ev("answer_verify", "PASS", { groundedness: 0.9 })],
      "结论 [1]，另一个结论 [2]，重复 [1]",
    );
    expect(verdict).toMatchObject({ kind: "verified", citations: 2, searches: 1, rewrites: 0, groundedness: 0.9 });
  });

  it("is corrected when a rewrite happened and the final verification passes", () => {
    const verdict = deriveVerdict(
      [
        ev("retrieve", "COMPLETE", { query: "a" }),
        ev("evidence_evaluate", "FAIL"),
        ev("query_rewrite", "COMPLETE", { from: "a", to: "b" }),
        ev("retrieve", "COMPLETE", { query: "b" }),
        ev("answer_verify", "PASS"),
      ],
      "答案 [1]",
    );
    expect(verdict).toMatchObject({ kind: "corrected", rewrites: 1, searches: 2, queries: ["a", "b"] });
  });

  it("is partial when a partial answer was kept", () => {
    const verdict = deriveVerdict([ev("answer_reverify", "FAIL"), ev("partial_answer", "COMPLETE")], "部分 [1]");
    expect(verdict?.kind).toBe("partial");
  });

  it("is abstained when the system refused", () => {
    const verdict = deriveVerdict([ev("retrieve", "COMPLETE", { query: "x" }), ev("abstain", "COMPLETE")], "没有");
    expect(verdict).toMatchObject({ kind: "abstained", queries: ["x"] });
  });

  it("is unchecked when no verification passed", () => {
    expect(deriveVerdict([ev("retrieve", "COMPLETE")], "答案")?.kind).toBe("unchecked");
  });
});
