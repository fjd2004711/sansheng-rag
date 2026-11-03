"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Maximize2 } from "lucide-react";

import type { GateCheck, RepairOutcome, TaskRow } from "@/lib/orchestration";
import { cn } from "@/lib/utils";
import type { RunEvent, SpecGraph } from "@/types/orchestration";

import { EventLog } from "./event-log";
import { GatePanel } from "./gate-panel";
import { Waterfall } from "./waterfall";

type Tab = "timeline" | "gate" | "events";
type Size = "min" | "mid" | "max";

const HEIGHT: Record<Size, string> = { min: "h-10", mid: "h-[320px]", max: "h-[62%]" };

/** The bottom dock (browser-devtools / n8n style): scheduling waterfall, quality gate, raw events. */
export function RunDock({
  graph,
  tasks,
  now,
  events,
  checks,
  outcomes,
  selected,
  onSelect,
  hasGate,
}: {
  graph: SpecGraph;
  tasks: TaskRow[];
  now: number;
  events: RunEvent[];
  checks: GateCheck[];
  outcomes: Record<number, RepairOutcome[]>;
  selected: string | null;
  onSelect: (id: string | null) => void;
  hasGate: boolean;
}) {
  const [tab, setTab] = useState<Tab>("timeline");
  const [size, setSize] = useState<Size>("mid");
  const gateNode = graph.nodes.find((n) => n.kind === "gate");
  const tabs: [Tab, string, number?][] = [
    ["timeline", "调度时间线", tasks.length],
    ...(hasGate ? ([["gate", "质量门与自循环", checks.length]] as [Tab, string, number][]) : []),
    ["events", "事件日志", events.length],
  ];

  return (
    <section
      className={cn(
        "bg-card flex shrink-0 flex-col border-t transition-[height] duration-200",
        HEIGHT[size],
      )}
    >
      <div className="flex h-10 shrink-0 items-center gap-1 border-b px-2">
        {tabs.map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTab(key);
              if (size === "min") setSize("mid");
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors",
              tab === key && size !== "min"
                ? "bg-foreground/8 text-foreground font-medium"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {label}
            {count !== undefined && count > 0 && (
              <span className="bg-muted text-muted-foreground rounded-full px-1.5 text-[10px] tabular-nums">
                {count}
              </span>
            )}
          </button>
        ))}
        <div className="ml-auto flex items-center">
          <button
            type="button"
            aria-label="放大"
            onClick={() => setSize(size === "max" ? "mid" : "max")}
            className="text-muted-foreground hover:bg-muted rounded p-1.5"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label={size === "min" ? "展开" : "收起"}
            onClick={() => setSize(size === "min" ? "mid" : "min")}
            className="text-muted-foreground hover:bg-muted rounded p-1.5"
          >
            {size === "min" ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
      {size !== "min" && (
        <div className="min-h-0 flex-1 overflow-auto">
          {tab === "timeline" && (
            <Waterfall
              tasks={tasks}
              graph={graph}
              now={now}
              selected={selected}
              onSelect={onSelect}
            />
          )}
          {tab === "gate" && (
            <GatePanel
              checks={checks}
              outcomes={outcomes}
              gate={gateNode?.gate ?? null}
              stalled={events.some((e) => e.kind === "repair_stalled")}
              skippedBudget={events.some((e) => e.kind === "repair_skipped_budget")}
            />
          )}
          {tab === "events" && <EventLog events={events} />}
        </div>
      )}
    </section>
  );
}
