"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from "@/components/ui";
import { useRuns, useSpecs } from "@/hooks/use-orchestration";
import { getErrorMessage } from "@/lib/utils";

import { InsightsPanel } from "./insights-panel";
import { RunPanel } from "./run-panel";
import { SpecPanel } from "./spec-panel";

const STATUS: Record<string, string> = {
  queued: "排队",
  running: "运行中",
  done: "完成",
  failed: "失败",
};
const EXAMPLES: Record<string, string[]> = {
  "verified-report": ["2025届大学生就业情况怎么样？", "中国新能源汽车产销与渗透率"],
  "fact-check": [
    "2023年我国国内生产总值为126万亿元，同比增长5.2%，全国居民人均可支配收入为39218元。",
  ],
};

/** The orchestration platform: run a team on a task, watch it being scheduled, read its definitions, learn from runs. */
export function OrchestrationWorkspace() {
  const specs = useSpecs();
  const runs = useRuns();
  const [specName, setSpecName] = useState("verified-report");
  const [topic, setTopic] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const spec = specs.specs.find((s) => s.name === specName);
  const current = runs.items.find((r) => r.id === selected) ?? runs.items[0] ?? null;

  const start = async (event: React.FormEvent) => {
    event.preventDefault();
    if (topic.trim().length < 2) return;
    setBusy(true);
    try {
      const run = await runs.create(specName, topic.trim());
      setSelected(run.id);
      setTopic("");
      toast.success("已开始运行，右侧可以实时看到调度过程");
    } catch (error) {
      toast.error(getErrorMessage(error, "创建运行失败"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 px-3 py-4 sm:px-6">
      <header>
        <h1 className="text-2xl font-bold">多智能体编排平台</h1>
        <p className="text-muted-foreground text-sm">
          用声明式定义组一支智能体团队，动态调度并行执行，由独立核查员把关，不达标就按失败类型自循环修复。
        </p>
      </header>
      <Tabs defaultValue="runs">
        <TabsList>
          <TabsTrigger value="runs">运行</TabsTrigger>
          <TabsTrigger value="specs">团队与工作流定义</TabsTrigger>
          <TabsTrigger value="insights">改进建议</TabsTrigger>
        </TabsList>
        <TabsContent value="runs" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <aside className="space-y-3">
              <form onSubmit={start} className="bg-card space-y-2 rounded-xl border p-3">
                <label className="text-sm font-medium" htmlFor="spec">
                  工作流
                </label>
                <select
                  id="spec"
                  value={specName}
                  onChange={(e) => setSpecName(e.target.value)}
                  className="bg-background w-full rounded-md border px-2 py-1.5 text-sm"
                >
                  {specs.specs.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name}
                      {s.builtin ? "" : "（我的）"}
                    </option>
                  ))}
                </select>
                <p className="text-muted-foreground text-xs">{spec?.description}</p>
                <Textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  rows={spec?.input === "text" ? 5 : 2}
                  placeholder={spec?.input === "text" ? "粘贴要核查的文字" : "输入调研主题"}
                />
                <div className="flex flex-wrap gap-1">
                  {(EXAMPLES[specName] ?? []).map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => setTopic(ex)}
                      className="text-muted-foreground hover:text-foreground rounded border px-2 py-0.5 text-left text-xs"
                    >
                      {ex.slice(0, 22)}
                      {ex.length > 22 ? "…" : ""}
                    </button>
                  ))}
                </div>
                <Button type="submit" disabled={busy || topic.trim().length < 2} className="w-full">
                  开始运行
                </Button>
              </form>
              <ul className="space-y-1">
                {runs.items.map((run) => (
                  <li key={run.id}>
                    <div
                      className={`flex items-center gap-1 rounded-md border px-2 py-1.5 text-sm ${run.id === current?.id ? "bg-primary/10 border-primary" : ""}`}
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => setSelected(run.id)}
                      >
                        <div className="truncate">{run.topic}</div>
                        <div className="text-muted-foreground text-xs">
                          {run.spec_name} · {STATUS[run.status]}
                          {run.status === "running" ? ` ${run.progress}%` : ""}
                        </div>
                      </button>
                      <button
                        type="button"
                        aria-label="删除"
                        className="text-muted-foreground hover:text-red-600"
                        onClick={() => void runs.remove(run.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </aside>
            <main className="min-w-0">
              {current ? (
                <RunPanel key={current.id} summary={current} />
              ) : (
                <p className="text-muted-foreground text-sm">
                  还没有运行。选一个工作流，输入主题开始。
                </p>
              )}
            </main>
          </div>
        </TabsContent>
        <TabsContent value="specs" className="mt-4">
          <SpecPanel specs={specs} />
        </TabsContent>
        <TabsContent value="insights" className="mt-4">
          <InsightsPanel refreshKey={runs.items.map((r) => r.status).join(",")} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
