import type { GraphNode, RunEvent, SpecGraph } from "@/types/orchestration";

export type TaskStatus = "pending" | "running" | "done" | "failed" | "skipped";

export interface TaskRow {
  id: string;
  group: string;
  label: string;
  pool: string;
  start: number;
  end: number | null;
  status: TaskStatus;
  attempts: number;
  note?: string;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Fold the append-only event log into one row per task (what the timeline draws). */
export function deriveTasks(events: RunEvent[]): TaskRow[] {
  const rows = new Map<string, TaskRow>();
  for (const e of events) {
    const d = e.detail;
    const id = str(d.task);
    if (!id) continue;
    if (e.kind === "task_start") {
      const prev = rows.get(id);
      rows.set(id, {
        id,
        group: str(d.group),
        label: str(d.label) || id,
        pool: str(d.pool) || "none",
        start: prev?.start ?? e.t,
        end: null,
        status: "running",
        attempts: Number(d.attempt) || 1,
      });
    } else if (e.kind === "task_done") {
      const row = rows.get(id);
      if (row) Object.assign(row, { end: e.t, status: "done" as const });
    } else if (e.kind === "task_failed") {
      const row = rows.get(id);
      if (row) Object.assign(row, { end: e.t, status: "failed" as const, note: str(d.error) });
    } else if (e.kind === "task_skipped") {
      rows.set(id, {
        id,
        group: str(d.group),
        label: id,
        pool: "none",
        start: e.t,
        end: e.t,
        status: "skipped",
        attempts: 0,
        note: str(d.reason),
      });
    } else if (e.kind === "task_retry") {
      const row = rows.get(id);
      if (row) row.note = `重试：${str(d.reason) === "model_fallback" ? "模型降级" : "出错"}`;
    }
  }
  return [...rows.values()].sort((a, b) => a.start - b.start);
}

export interface NodeProgress {
  status: TaskStatus;
  done: number;
  total: number;
}

/** A node's state from the tasks of its group(s); repair rounds ("repair#r1:…") belong to the "repair" node. */
export function nodeProgress(
  graph: SpecGraph,
  tasks: TaskRow[],
  events: RunEvent[],
): Record<string, NodeProgress> {
  const expanded = new Set(
    events.filter((e) => e.kind === "group_expanded").map((e) => str(e.detail.group)),
  );
  const out: Record<string, NodeProgress> = {};
  for (const node of graph.nodes) {
    const mine = tasks.filter((t) => t.group === node.id || t.group.startsWith(`${node.id}#`));
    const done = mine.filter((t) => t.status === "done" || t.status === "skipped").length;
    let status: TaskStatus = "pending";
    if (mine.some((t) => t.status === "failed")) status = "failed";
    else if (mine.some((t) => t.status === "running")) status = "running";
    else if (mine.length > 0 && expanded.has(node.id) && done === mine.length) status = "done";
    else if (mine.length > 0) status = "running";
    out[node.id] = { status, done, total: mine.length };
  }
  return out;
}

export interface GateCheck {
  round: number;
  passed: boolean;
  metrics: Record<string, number>;
  reasons: string[];
  failures: { section: string; type: string; label: string; detail: string }[];
}

export function gateChecks(events: RunEvent[]): GateCheck[] {
  return events
    .filter((e) => e.kind === "gate_checked")
    .map((e) => ({
      round: Number(e.detail.round) || 0,
      passed: Boolean(e.detail.passed),
      metrics: (e.detail.metrics as Record<string, number>) ?? {},
      reasons: (e.detail.reasons as string[]) ?? [],
      failures: (e.detail.failures as GateCheck["failures"]) ?? [],
    }));
}

/** Topological levels (0 = no dependencies) used for the left-to-right layout. */
export function levelsOf(graph: SpecGraph): Record<string, number> {
  const deps = new Map<string, string[]>();
  for (const n of graph.nodes) deps.set(n.id, []);
  for (const e of graph.edges) if (e.kind === "depends") deps.get(e.target)?.push(e.source);
  const level: Record<string, number> = {};
  const visit = (id: string): number => {
    if (level[id] !== undefined) return level[id];
    level[id] = 0; // guards a malformed cycle; the backend already rejects cycles
    level[id] = Math.max(-1, ...(deps.get(id) ?? []).map(visit)) + 1;
    return level[id];
  };
  graph.nodes.forEach((n) => visit(n.id));
  // A repair loop sits one step to the right of the gate that triggers it.
  for (const e of graph.edges)
    if (e.kind === "repair") level[e.target] = (level[e.source] ?? 0) + 0;
  return level;
}

export const NODE_KIND_LABELS: Record<GraphNode["kind"], string> = {
  agent: "单步",
  map: "并行扇出",
  gate: "质量门",
  loop: "自循环",
  merge: "汇总",
};
