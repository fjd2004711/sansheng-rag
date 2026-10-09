import type { AgentTraceEvent } from "@/types";

/** Seconds each step took (time since the previous step ended), or undefined for traces saved before timing existed. */
export function stepSeconds(trace: AgentTraceEvent[], index: number): number | undefined {
  const at = trace[index]?.at_ms;
  if (typeof at !== "number") return undefined;
  const before = index === 0 ? 0 : trace[index - 1]?.at_ms;
  if (typeof before !== "number") return undefined;
  return Math.max(0, at - before) / 1000;
}

export function totalSeconds(trace: AgentTraceEvent[]): number | undefined {
  const last = trace[trace.length - 1]?.at_ms;
  return typeof last === "number" ? last / 1000 : undefined;
}

export const formatSeconds = (seconds: number): string => (seconds < 10 ? `${seconds.toFixed(1)} 秒` : `${Math.round(seconds)} 秒`);
