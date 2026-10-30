import { describe, expect, it } from "vitest";

import { deriveTasks, gateChecks, levelsOf, nodeProgress } from "./orchestration";
import type { RunEvent, SpecGraph } from "@/types/orchestration";

const ev = (seq: number, t: number, kind: string, detail: Record<string, unknown>): RunEvent => ({
  seq,
  t,
  kind,
  detail,
});

const graph: SpecGraph = {
  nodes: [
    { id: "plan", kind: "agent" },
    { id: "sections", kind: "map" },
    { id: "gate", kind: "gate" },
    { id: "repair", kind: "loop" },
  ].map((n) => ({
    ...n,
    agent: null,
    role: "",
    skill: "",
    pool: "llm",
    essential: true,
    independent: false,
    on_fail: null,
    gate: null,
    max_rounds: 1,
  })) as SpecGraph["nodes"],
  edges: [
    { source: "plan", target: "sections", kind: "depends" },
    { source: "sections", target: "gate", kind: "depends" },
    { source: "gate", target: "repair", kind: "repair" },
  ],
  policy: {},
  team: { name: "t", members: [], supervisor: null },
  agents: [],
};

describe("deriveTasks", () => {
  it("folds start/done/failed/skipped events into one row per task", () => {
    const rows = deriveTasks([
      ev(1, 0, "task_start", {
        task: "plan",
        group: "plan",
        label: "规划",
        pool: "llm",
        attempt: 1,
      }),
      ev(2, 1.5, "task_done", { task: "plan", group: "plan" }),
      ev(3, 1.6, "task_start", {
        task: "sections#0",
        group: "sections",
        label: "第一章",
        pool: "llm",
        attempt: 1,
      }),
      ev(4, 2.0, "task_failed", { task: "sections#0", group: "sections", error: "boom" }),
      ev(5, 2.1, "task_skipped", { task: "repair#r1", group: "repair#r1", reason: "预算" }),
    ]);
    expect(rows.map((r) => [r.id, r.status])).toEqual([
      ["plan", "done"],
      ["sections#0", "failed"],
      ["repair#r1", "skipped"],
    ]);
    expect(rows[0]).toMatchObject({ start: 0, end: 1.5 });
  });
});

describe("nodeProgress", () => {
  it("counts a map node's tasks and attributes repair rounds to the repair node", () => {
    const events = [
      ev(1, 0, "group_expanded", { group: "sections", tasks: ["sections#0", "sections#1"] }),
    ];
    const tasks = deriveTasks([
      ev(2, 0, "task_start", { task: "sections#0", group: "sections", pool: "llm" }),
      ev(3, 1, "task_done", { task: "sections#0", group: "sections" }),
      ev(4, 0, "task_start", { task: "sections#1", group: "sections", pool: "llm" }),
      ev(5, 2, "task_start", {
        task: "repair#r1:search",
        group: "repair#r1:search",
        pool: "search",
      }),
    ]);
    const progress = nodeProgress(graph, tasks, events);
    expect(progress.sections).toMatchObject({ status: "running", done: 1, total: 2 });
    expect(progress.repair?.status).toBe("running");
    expect(progress.plan?.status).toBe("pending");
  });
});

describe("gateChecks and levels", () => {
  it("reads gate rounds and lays nodes out by dependency depth", () => {
    const checks = gateChecks([
      ev(1, 5, "gate_checked", {
        round: 0,
        passed: false,
        reasons: ["x"],
        failures: [],
        metrics: { verified_ratio: 0.4 },
      }),
      ev(2, 9, "gate_checked", { round: 1, passed: true, reasons: [], failures: [], metrics: {} }),
    ]);
    expect(checks.map((c) => c.passed)).toEqual([false, true]);
    const levels = levelsOf(graph);
    expect(levels.plan).toBe(0);
    expect(levels.sections).toBe(1);
    expect(levels.gate).toBe(2);
  });
});

import {
  describeEvent,
  formatDuration,
  nodeOfGroup,
  repairOutcomesByRound,
  tasksByNode,
  timeAgo,
} from "./orchestration";

describe("grouping and wording helpers", () => {
  it("maps task groups to workflow nodes and groups tasks by node", () => {
    expect(nodeOfGroup("repair#r1:search")).toBe("repair");
    expect(nodeOfGroup("sections#2")).toBe("sections");
    expect(nodeOfGroup("plan")).toBe("plan");
    const grouped = tasksByNode(
      deriveTasks([
        ev(1, 0, "task_start", { task: "sections#0", group: "sections", pool: "llm" }),
        ev(2, 0, "task_start", {
          task: "repair#r1:search",
          group: "repair#r1:search",
          pool: "search",
        }),
      ]),
    );
    expect(Object.keys(grouped).sort()).toEqual(["repair", "sections"]);
  });

  it("formats durations and relative times in Chinese", () => {
    expect(formatDuration(3.21)).toBe("3.2 秒");
    expect(formatDuration(45)).toBe("45 秒");
    expect(formatDuration(125)).toBe("2 分 5 秒");
    expect(formatDuration(120)).toBe("2 分");
    const now = new Date("2026-10-30T12:00:00Z").getTime();
    expect(timeAgo("2026-10-30T11:58:00Z", now)).toBe("2 分钟前");
    expect(timeAgo("2026-10-30T09:00:00Z", now)).toBe("3 小时前");
    expect(timeAgo("2026-10-27T12:00:00Z", now)).toBe("3 天前");
  });

  it("describes events and attributes rewrite outcomes to their repair round", () => {
    const line = describeEvent(
      ev(1, 4, "gate_checked", { round: 0, passed: false, metrics: { verified_ratio: 0.603 } }),
    );
    expect(line).toMatchObject({ tone: "warn", group: "gate" });
    expect(line.text).toContain("60%");
    const byRound = repairOutcomesByRound([
      ev(1, 1, "gate_checked", { round: 0, passed: false }),
      ev(2, 2, "repair_accepted", { section: "A", before: 0.5, after: 0.8 }),
      ev(3, 3, "repair_rejected", { section: "B", before: 0.7, after: 0.2 }),
      ev(4, 4, "gate_checked", { round: 1, passed: false }),
      ev(5, 5, "repair_accepted", { section: "C", before: 0.1, after: 0.2 }),
    ]);
    expect(byRound[1]?.map((o) => [o.section, o.accepted])).toEqual([
      ["A", true],
      ["B", false],
    ]);
    expect(byRound[2]?.map((o) => o.section)).toEqual(["C"]);
  });
});
