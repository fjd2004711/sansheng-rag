"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Textarea,
} from "@/components/ui";
import { apiClient } from "@/lib/api-client";
import { cn, getErrorMessage } from "@/lib/utils";
import type { RunModels } from "@/hooks/use-orchestration";
import type { Spec } from "@/types/orchestration";

const EXAMPLES: Record<string, string[]> = {
  "verified-report": [
    "2025届大学生就业情况怎么样？",
    "中国新能源汽车产销与渗透率",
    "全国居民人均可支配收入变化",
  ],
  "fact-check": [
    "2023年我国国内生产总值为126万亿元，同比增长5.2%。全国居民人均可支配收入为39218元。",
  ],
};

/** Pick a workflow and give it a task (like Dify's "run" panel). */
export function NewRunDialog({
  open,
  onOpenChange,
  specs,
  onStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  specs: Spec[];
  onStart: (spec: string, topic: string, models?: RunModels) => Promise<void>;
}) {
  const [specName, setSpecName] = useState("verified-report");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState<string[]>([]);
  const [fallback, setFallback] = useState("");
  const [model, setModel] = useState("");
  const [agentModels, setAgentModels] = useState<Record<string, string>>({});
  const [showAgents, setShowAgents] = useState(false);

  useEffect(() => {
    if (!open || available.length) return;
    apiClient
      .get<{ default: string; models: string[] }>("/v1/agent/models")
      .then((r) => {
        setAvailable(r.models);
        setFallback(r.default);
      })
      .catch(() => undefined);
  }, [open, available.length]);
  const spec = specs.find((s) => s.name === specName) ?? specs[0];
  const isText = spec?.input === "text";
  const agents = spec?.graph.agents ?? [];
  const choices = Array.from(new Set([fallback, ...available].filter(Boolean)));
  const customized = Object.values(agentModels).filter(Boolean).length;

  const submit = async () => {
    if (topic.trim().length < 2 || !spec) return;
    setBusy(true);
    try {
      const chosen = Object.fromEntries(
        Object.entries(agentModels).filter(([name, m]) => m && agents.some((a) => a.name === name)),
      );
      await onStart(spec.name, topic.trim(), { model: model || undefined, agent_models: chosen });
      setTopic("");
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "创建运行失败"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-5">
        <DialogHeader>
          <DialogTitle>新建运行</DialogTitle>
          <DialogDescription>
            选一个工作流，给它一个任务。运行会在后台进行，可以随时离开。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2">
          {specs.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => setSpecName(s.name)}
              className={cn(
                "rounded-xl border p-3 text-left transition-colors",
                s.name === spec?.name
                  ? "border-brand bg-brand/6 ring-brand/30 ring-2"
                  : "hover:bg-muted/60",
              )}
            >
              <div className="text-sm font-medium">{s.name}</div>
              <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs leading-snug">
                {s.description}
              </p>
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="run-input">
            {isText ? "要核查的文字" : "调研主题"}
          </label>
          <Textarea
            id="run-input"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={isText ? 5 : 3}
            placeholder={
              isText
                ? "粘贴一段含数字、日期等事实性说法的文字"
                : "例如：2025届大学生就业情况怎么样？"
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
            }}
          />
          <div className="flex flex-wrap gap-1.5">
            {(EXAMPLES[spec?.name ?? ""] ?? []).map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setTopic(ex)}
                className="text-muted-foreground hover:bg-muted hover:text-foreground max-w-full truncate rounded-full border px-2.5 py-1 text-xs transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm font-medium" htmlFor="run-model">
              模型
            </label>
            <select
              id="run-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="border-input bg-background h-8 max-w-[60%] rounded-md border px-2 text-sm"
            >
              <option value="">系统默认{fallback ? `（${fallback}）` : ""}</option>
              {choices.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <p className="text-muted-foreground text-xs">所有 agent 默认都用这一个模型。</p>
          <button
            type="button"
            onClick={() => setShowAgents((v) => !v)}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
            aria-expanded={showAgents}
          >
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", showAgents && "rotate-180")}
            />
            按 agent 单独指定{customized ? `（已指定 ${customized} 个）` : ""}
          </button>
          {showAgents && (
            <ul className="divide-y rounded-md border">
              {agents.map((a) => (
                <li key={a.name} className="flex items-center justify-between gap-3 px-2.5 py-1.5">
                  <span className="min-w-0 text-sm">
                    <span className="font-medium">{a.name}</span>
                    <span className="text-muted-foreground ml-1.5 text-xs">{a.role}</span>
                  </span>
                  <select
                    aria-label={`${a.name} 使用的模型`}
                    value={agentModels[a.name] ?? ""}
                    onChange={(e) =>
                      setAgentModels((cur) => ({ ...cur, [a.name]: e.target.value }))
                    }
                    className="border-input bg-background h-8 max-w-[55%] rounded-md border px-2 text-xs"
                  >
                    <option value="">跟随统一模型</option>
                    {choices.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">⌘ / Ctrl + Enter 开始</span>
          <button
            type="button"
            disabled={busy || topic.trim().length < 2}
            onClick={() => void submit()}
            className="bg-foreground text-background flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            开始运行
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
