"use client";

import { useEffect, useState } from "react";
import { Bot, CheckCircle2, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import type { useSpecs } from "@/hooks/use-orchestration";
import { cn, getErrorMessage } from "@/lib/utils";
import type { SpecValidation } from "@/types/orchestration";

import { FlowCanvas } from "./flow-canvas";

type Specs = ReturnType<typeof useSpecs>;
type Pane = "agents" | "policy" | "yaml";

const POLICY_LABELS: Record<string, string> = {
  max_tokens: "token 预算",
  max_seconds: "时间预算（秒）",
  max_repair_rounds: "最多修复轮次",
  search_concurrency: "搜索并发",
  llm_concurrency: "模型并发",
};

/** A workflow definition: its graph, its team, its policy, and the YAML behind them (editable, validated live). */
export function SpecView({ specs, selected }: { specs: Specs; selected: string | null }) {
  const current = specs.specs.find((s) => s.name === selected) ?? specs.specs[0];
  const [text, setText] = useState("");
  const [check, setCheck] = useState<SpecValidation | null>(null);
  const [busy, setBusy] = useState(false);
  const [pane, setPane] = useState<Pane>("agents");

  useEffect(() => {
    if (current) {
      setText(current.yaml);
      setCheck(null);
    }
  }, [current]);

  if (!current) return <p className="text-muted-foreground p-6 text-sm">加载中…</p>;
  const graph = check?.graph ?? current.graph;
  const edited = text !== current.yaml;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const validate = () => run(async () => setCheck(await specs.validate(text)));
  const save = () =>
    run(async () => {
      try {
        const saved = await specs.save(text);
        toast.success(`已保存为「${saved.name}」，可在“新建运行”里选择它`);
      } catch (error) {
        toast.error(getErrorMessage(error, "保存失败"));
      }
    });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="bg-card flex h-14 shrink-0 items-center gap-3 border-b pr-4 pl-12 lg:pl-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold tracking-tight">{current.name}</h2>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px]",
                current.builtin ? "bg-muted text-muted-foreground" : "bg-brand/12 text-brand",
              )}
            >
              {current.builtin ? "内置（只读，改名后可另存）" : "我的定义"}
            </span>
          </div>
          <p className="text-muted-foreground truncate text-xs">{current.description}</p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void validate()}
          className="hover:bg-muted rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
        >
          校验
        </button>
        <button
          type="button"
          disabled={busy || !check?.ok}
          onClick={() => void save()}
          className="bg-foreground text-background rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          保存为我的定义
        </button>
        {!current.builtin && (
          <button
            type="button"
            onClick={() => void specs.remove(current.name)}
            className="rounded-lg border px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/8"
          >
            删除
          </button>
        )}
      </header>
      <div className="min-h-0 flex-[1.15]">
        <FlowCanvas graph={graph} />
      </div>
      <section className="bg-card flex min-h-0 flex-1 flex-col border-t">
        <div className="flex h-10 shrink-0 items-center gap-1 border-b px-2">
          {(
            [
              ["agents", `智能体（${graph.agents.length}）`],
              ["policy", "策略"],
              ["yaml", "YAML"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPane(key)}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs transition-colors",
                pane === key
                  ? "bg-foreground/8 font-medium"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
          {check && (
            <span
              className={cn(
                "ml-auto flex items-center gap-1.5 truncate pr-2 text-xs",
                check.ok ? "text-emerald-600" : "text-red-600",
              )}
            >
              {check.ok ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <TriangleAlert className="h-3.5 w-3.5" />
              )}
              <span className="truncate">
                {check.ok ? `校验通过，上方的图已按当前文本刷新` : check.error}
              </span>
            </span>
          )}
          {!check && edited && (
            <span className="text-muted-foreground ml-auto pr-2 text-xs">已修改，点“校验”检查</span>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {pane === "agents" && (
            <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {graph.agents.map((a) => (
                <div key={a.name} className="rounded-xl border p-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/12 text-sky-600 dark:text-sky-400">
                      <Bot className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold">{a.name}</div>
                      <div className="text-muted-foreground truncate text-xs">{a.role}</div>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                    <code className="bg-muted rounded px-1.5 py-0.5">{a.skill}</code>
                    <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5">
                      模型：{a.model_tier === "fast" ? "轻量" : "强"}
                    </span>
                    {a.independent && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/12 px-1.5 py-0.5 font-medium text-emerald-700 dark:text-emerald-400">
                        <ShieldCheck className="h-2.5 w-2.5" />
                        独立核查
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {pane === "policy" && (
            <dl className="grid max-w-xl gap-x-8 p-4 text-sm sm:grid-cols-2">
              {Object.entries(graph.policy)
                .filter(([k]) => k in POLICY_LABELS)
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b py-2">
                    <dt className="text-muted-foreground">{POLICY_LABELS[k]}</dt>
                    <dd className="font-medium tabular-nums">{String(v)}</dd>
                  </div>
                ))}
            </dl>
          )}
          {pane === "yaml" && (
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setCheck(null);
              }}
              spellCheck={false}
              aria-label="工作流定义（YAML）"
              className="bg-muted/30 h-full w-full resize-none p-4 font-mono text-xs leading-relaxed outline-none"
            />
          )}
        </div>
      </section>
    </div>
  );
}
