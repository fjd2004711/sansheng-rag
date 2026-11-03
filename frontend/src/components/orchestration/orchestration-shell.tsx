"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { toast } from "sonner";

import { Sheet, SheetContent } from "@/components/ui";
import { useRuns, useSpecs } from "@/hooks/use-orchestration";

import { InsightsView } from "./insights-view";
import { NewRunDialog } from "./new-run-dialog";
import { RunView } from "./run-view";
import { Sidebar, type Tab } from "./sidebar";
import { SpecView } from "./spec-view";

/** The platform's app frame: left rail + workspace, filling the space under the site header. */
export function OrchestrationShell() {
  const specs = useSpecs();
  const runs = useRuns();
  const [tab, setTab] = useState<Tab>("runs");
  const [runId, setRunId] = useState<string | null>(null);
  const [specName, setSpecName] = useState<string | null>(null);
  const [dialog, setDialog] = useState(false);
  const [drawer, setDrawer] = useState(false);

  const run = runs.items.find((r) => r.id === runId) ?? runs.items[0] ?? null;

  useEffect(() => {
    if (!runId && runs.items[0]) setRunId(runs.items[0].id);
  }, [runId, runs.items]);

  const sidebar = (
    <Sidebar
      tab={tab}
      onTab={setTab}
      runs={runs.items}
      specs={specs.specs}
      selectedRun={run?.id ?? null}
      selectedSpec={specName ?? specs.specs[0]?.name ?? null}
      onSelectRun={(id) => {
        setRunId(id);
        setTab("runs");
        setDrawer(false);
      }}
      onSelectSpec={(name) => {
        setSpecName(name);
        setDrawer(false);
      }}
      onDeleteRun={(id) => void runs.remove(id).catch(() => toast.error("删除失败"))}
      onNewRun={() => {
        setDialog(true);
        setDrawer(false);
      }}
    />
  );

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-0 w-full md:h-screen">
      <aside className="hidden w-64 shrink-0 border-r lg:block">{sidebar}</aside>
      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="left" className="w-80 max-w-[85vw] p-0">
          {sidebar}
        </SheetContent>
      </Sheet>
      <main className="relative flex min-w-0 flex-1 flex-col">
        <button
          type="button"
          aria-label="打开菜单"
          onClick={() => setDrawer(true)}
          className="bg-card absolute top-2.5 left-2 z-20 rounded-md border p-1.5 shadow-sm lg:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>
        {tab === "runs" &&
          (run ? (
            <RunView
              key={run.id}
              summary={run}
              onCancel={() =>
                void runs
                  .cancel(run.id)
                  .then(() => toast.success("已取消这次运行"))
                  .catch(() => toast.error("取消失败，运行可能已经结束"))
              }
              onRerun={() =>
                void runs
                  .create(run.spec_name, run.topic)
                  .then((created) => {
                    setRunId(created.id);
                    toast.success("已重新开始运行");
                  })
                  .catch(() => toast.error("无法重新运行：可能已有运行在进行，或今日次数已用完"))
              }
            />
          ) : (
            <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 text-sm">
              还没有运行。
              <button
                type="button"
                onClick={() => setDialog(true)}
                className="bg-foreground text-background rounded-lg px-4 py-2 text-sm font-medium"
              >
                新建运行
              </button>
            </div>
          ))}
        {tab === "specs" && <SpecView specs={specs} selected={specName} />}
        {tab === "insights" && (
          <InsightsView refreshKey={runs.items.map((r) => r.status).join(",")} />
        )}
      </main>
      <NewRunDialog
        open={dialog}
        onOpenChange={setDialog}
        specs={specs.specs}
        onStart={async (spec, topic, models) => {
          const created = await runs.create(spec, topic, models);
          setRunId(created.id);
          setTab("runs");
          toast.success("已开始运行，可以实时看到调度过程");
        }}
      />
    </div>
  );
}
