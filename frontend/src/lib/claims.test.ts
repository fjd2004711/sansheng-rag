import { describe, expect, it } from "vitest";

import { citationStatus, finalClaims } from "./claims";

const event = (step: string, claims: unknown) => ({ step, round: 1, status: "PASS", detail: { claims } });

describe("finalClaims", () => {
  it("uses the last verification step", () => {
    const trace = [
      event("answer_verify", [{ claim: "旧", supported: false }]),
      event("answer_reverify", [{ claim: "新", supported: true }]),
    ];
    expect(finalClaims(trace).map((c) => c.claim)).toEqual(["新"]);
  });

  it("is empty without a trace or claims", () => {
    expect(finalClaims(undefined)).toEqual([]);
    expect(finalClaims([event("retrieve", undefined)])).toEqual([]);
  });
});

describe("citationStatus", () => {
  it("marks a citation bad if any claim using it is unsupported", () => {
    const status = citationStatus([
      { claim: "a", supported: true, citation_indices: [1, 2] },
      { claim: "b", supported: false, citation_indices: [2] },
    ]);
    expect(status.get(1)).toBe("ok");
    expect(status.get(2)).toBe("bad");
  });
});
