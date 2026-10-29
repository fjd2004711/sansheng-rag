import type { ReportClaim, ReportDocument } from "@/types/report";

export type RunStatus = "queued" | "running" | "done" | "failed";

export interface GraphNode {
  id: string;
  kind: "agent" | "map" | "gate" | "loop" | "merge";
  agent: string | null;
  role: string;
  skill: string;
  pool: string;
  essential: boolean;
  independent: boolean;
  on_fail: string | null;
  gate: Record<string, number | boolean> | null;
  max_rounds: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: "depends" | "repair";
}

export interface SpecGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  policy: Record<string, unknown>;
  team: { name: string; members: string[]; supervisor: string | null };
  agents: { name: string; role: string; skill: string; model_tier: string; independent: boolean }[];
}

export interface Spec {
  name: string;
  description: string;
  builtin: boolean;
  yaml: string;
  graph: SpecGraph;
  input: "topic" | "text";
}

export interface SpecValidation {
  ok: boolean;
  error: string | null;
  name: string | null;
  graph: SpecGraph | null;
}

export interface RunMetrics {
  wall_seconds: number;
  busy_seconds: number;
  parallel_speedup: number;
  tasks: number;
  tasks_failed: number;
  tasks_skipped: number;
  tokens: number;
  llm_calls: number;
  repair_rounds: number;
  repairs: { round: number; sections: string[]; types: string[] }[];
  verifier_downgrades: number;
  model: string;
  model_switches: { from: string; to: string; reason: string }[];
}

export interface RunSummary {
  id: string;
  spec_name: string;
  topic: string;
  status: RunStatus;
  stage: string;
  progress: number;
  error: string | null;
  created_at: string;
  updated_at: string | null;
  metrics: RunMetrics | null;
}

export interface RunEvent {
  seq: number;
  t: number;
  kind: string;
  detail: Record<string, unknown>;
}

export interface FactCheckResult {
  kind: "fact_check";
  text: string;
  claims: ReportClaim[];
  sources: { index: number; title: string; url: string; domain: string; tier: string }[];
}

export type RunResult = { kind: "report"; report: ReportDocument } | FactCheckResult;

export interface RunDetail extends RunSummary {
  result: RunResult | null;
  graph: SpecGraph | null;
  events: RunEvent[];
}

export interface Insights {
  runs: number;
  averages: Record<string, number>;
  failure_types: Record<string, number>;
  repair_success_rate: number | null;
  verified_gain: number | null;
  ratings: Record<string, number>;
  tags: Record<string, number>;
  hints: { signal: string; suggestion: string }[];
}
