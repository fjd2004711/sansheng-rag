import { describe, expect, it } from "vitest";

import { stepSeconds, totalSeconds } from "./step-timing";

const ev = (at_ms?: number) => ({ step: "x", round: 1, status: "PASS", detail: {}, at_ms });

describe("step timing", () => {
  it("measures each step from the end of the previous one", () => {
    const trace = [ev(1500), ev(4000), ev(4500)];
    expect([0, 1, 2].map((i) => stepSeconds(trace, i))).toEqual([1.5, 2.5, 0.5]);
    expect(totalSeconds(trace)).toBe(4.5);
  });

  it("is undefined for traces saved before timing existed", () => {
    expect(stepSeconds([ev(), ev()], 1)).toBeUndefined();
    expect(totalSeconds([ev()])).toBeUndefined();
  });
});
