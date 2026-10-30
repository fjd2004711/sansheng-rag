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
  runFinished = false,
): Record<string, NodeProgress> {
  const announced = events
    .filter((e) => e.kind === "group_expanded")
    .map((e) => ({
      group: str(e.detail.group),
      total: Array.isArray(e.detail.tasks) ? e.detail.tasks.length : 0,
    }));
  const out: Record<string, NodeProgress> = {};
  for (const node of graph.nodes) {
    const belongs = (g: string) => g === node.id || g.startsWith(`${node.id}#`);
    const mine = tasks.filter((t) => belongs(t.group));
    const expected = announced.filter((a) => belongs(a.group)).reduce((n, a) => n + a.total, 0);
    const done = mine.filter((t) => t.status === "done" || t.status === "skipped").length;
    let status: TaskStatus = "pending";
    if (mine.some((t) => t.status === "failed")) status = "failed";
    else if (mine.some((t) => t.status === "running")) status = "running";
    else if (expected > 0 && done >= expected) status = "done";
    else if (runFinished && mine.length > 0) status = "done";
    else if (mine.length > 0 || expected > 0) status = "running";
    out[node.id] = { status, done, total: Math.max(mine.length, expected) };
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

export interface RepairOutcome {
  section: string;
  accepted: boolean;
  before: number;
  after: number;
}

/** What each rewrite of the self-loop came to: kept (not worse) or thrown away (worse than the draft). */
export function repairOutcomes(events: RunEvent[]): RepairOutcome[] {
  return events
    .filter((e) => e.kind === "repair_accepted" || e.kind === "repair_rejected")
    .map((e) => ({
      section: str(e.detail.section),
      accepted: e.kind === "repair_accepted",
      before: Number(e.detail.before) || 0,
      after: Number(e.detail.after) || 0,
    }));
}

export const hasStalled = (events: RunEvent[]): boolean =>
  events.some((e) => e.kind === "repair_stalled");

/** The workflow node a task group belongs to ("repair#r1:search" → "repair", "sections#2" → "sections"). */
export function nodeOfGroup(group: string): string {
  return group.split("#")[0] ?? group;
}

export function tasksByNode(tasks: TaskRow[]): Record<string, TaskRow[]> {
  const out: Record<string, TaskRow[]> = {};
  for (const t of tasks) (out[nodeOfGroup(t.group)] ??= []).push(t);
  return out;
}

export function formatDuration(seconds: number): string {
  if (seconds < 10) return `${seconds.toFixed(1)} 秒`;
  if (seconds < 60) return `${Math.round(seconds)} 秒`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s ? `${m} 分 ${s} 秒` : `${m} 分`;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "刚刚";
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return `${Math.floor(s / 86400)} 天前`;
}

export type EventTone = "info" | "ok" | "warn" | "bad";

export interface EventLine {
  seq: number;
  t: number;
  kind: string;
  tone: EventTone;
  group: "task" | "gate" | "repair" | "system";
  text: string;
}

const pctText = (v: unknown) => (typeof v === "number" ? `${Math.round(v * 100)}%` : "—");

/** One readable line per event, built only from its structured fields. */
export function describeEvent(e: RunEvent): EventLine {
  const d = e.detail;
  const base = { seq: e.seq, t: e.t, kind: e.kind };
  const name = str(d.label) || str(d.task) || str(d.group);
  switch (e.kind) {
    case "group_expanded":
      return {
        ...base,
        tone: "info",
        group: "system",
        text: `展开节点 ${str(d.group)}，共 ${Array.isArray(d.tasks) ? d.tasks.length : 0} 个任务`,
      };
    case "task_start":
      return {
        ...base,
        tone: "info",
        group: "task",
        text: `开始 ${name}${Number(d.attempt) > 1 ? `（第 ${d.attempt} 次尝试）` : ""}`,
      };
    case "task_done":
      return {
        ...base,
        tone: "ok",
        group: "task",
        text: `完成 ${name}${typeof d.seconds === "number" ? `（${formatDuration(d.seconds)}）` : ""}`,
      };
    case "task_failed":
      return {
        ...base,
        tone: "bad",
        group: "task",
        text: `失败 ${name}：${str(d.error).slice(0, 120)}`,
      };
    case "task_skipped":
      return { ...base, tone: "warn", group: "task", text: `跳过 ${name}：${str(d.reason)}` };
    case "task_retry":
      return {
        ...base,
        tone: "warn",
        group: "task",
        text: `重试 ${name}（${str(d.reason) === "model_fallback" ? "模型降级后无损重试" : "出错"}）`,
      };
    case "gate_checked":
      return {
        ...base,
        tone: d.passed ? "ok" : "warn",
        group: "gate",
        text: `质量门第 ${Number(d.round) || 0} 次检查：${d.passed ? "通过" : "未通过"}（已核实 ${pctText((d.metrics as Record<string, number> | undefined)?.verified_ratio)}）`,
      };
    case "repair_accepted":
      return {
        ...base,
        tone: "ok",
        group: "repair",
        text: `采用重写：${str(d.section)}（${pctText(d.before)} → ${pctText(d.after)}）`,
      };
    case "repair_rejected":
      return {
        ...base,
        tone: "warn",
        group: "repair",
        text: `放弃重写，保留原稿：${str(d.section)}（${pctText(d.before)} → ${pctText(d.after)}）`,
      };
    case "repair_stalled":
      return { ...base, tone: "warn", group: "repair", text: "一轮修复没有进展，停止继续修复" };
    case "repair_skipped_budget":
      return { ...base, tone: "warn", group: "repair", text: "预算已用掉大半，不再开始新一轮修复" };
    case "model_fallback":
      return { ...base, tone: "warn", group: "system", text: `模型出错，自动降级到 ${str(d.to)}` };
    case "verifier_overturned":
      return {
        ...base,
        tone: "info",
        group: "gate",
        text: `核查员下调 ${str(d.section)} 的 ${d.claims} 条说法`,
      };
    case "search_batch_failed":
      return {
        ...base,
        tone: "warn",
        group: "system",
        text: `一批搜索失败：${Array.isArray(d.queries) ? (d.queries as string[]).join("、").slice(0, 60) : ""}`,
      };
    default:
      return { ...base, tone: "info", group: "system", text: e.kind };
  }
}

/** Rewrite outcomes grouped by the repair round they belong to (the gate check that triggered them + 1). */
export function repairOutcomesByRound(events: RunEvent[]): Record<number, RepairOutcome[]> {
  const out: Record<number, RepairOutcome[]> = {};
  let round = 0;
  for (const e of events) {
    if (e.kind === "gate_checked") round = Number(e.detail.round) || 0;
    if (e.kind === "repair_accepted" || e.kind === "repair_rejected") {
      (out[round + 1] ??= []).push({
        section: str(e.detail.section),
        accepted: e.kind === "repair_accepted",
        before: Number(e.detail.before) || 0,
        after: Number(e.detail.after) || 0,
      });
    }
  }
  return out;
}
