"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button, Textarea } from "@/components/ui";
import type { useSpecs } from "@/hooks/use-orchestration";
import { getErrorMessage } from "@/lib/utils";
import type { SpecGraph, SpecValidation } from "@/types/orchestration";

import { WorkflowGraph } from "./workflow-graph";

type Specs = ReturnType<typeof useSpecs>;

/** Definitions as code: pick one, read its graph and team, edit the YAML, validate it, save your own variant. */
export function SpecPanel({ specs }: { specs: Specs }) {
  const [selected, setSelected] = useState<string>("");
  const [text, setText] = useState("");
  const [check, setCheck] = useState<SpecValidation | null>(null);
  const [busy, setBusy] = useState(false);
  const current = specs.specs.find((s) => s.name === selected) ?? specs.specs[0];

  useEffect(() => {
    if (current) {
      setText(current.yaml);
      setCheck(null);
    }
  }, [current]);

  if (!current) return <p className="text-muted-foreground text-sm">加载中…</p>;
  const graph: SpecGraph = check?.graph ?? current.graph;

  const validate = async () => {
    setBusy(true);
    try {
      setCheck(await specs.validate(text));
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setBusy(true);
    try {
      const saved = await specs.save(text);
      setSelected(saved.name);
      toast.success(`已保存为「${saved.name}」，可在“运行”里选择它`);
    } catch (error) {
      toast.error(getErrorMessage(error, "保存失败"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <ul className="space-y-1">
        {specs.specs.map((s) => (
          <li key={s.name}>
            <button
              type="button"
              onClick={() => setSelected(s.name)}
              className={`w-full rounded-md border px-3 py-2 text-left text-sm ${s.name === current.name ? "bg-primary/10 border-primary" : "hover:bg-muted"}`}
            >
              <div className="font-medium">{s.name}</div>
              <div className="text-muted-foreground text-xs">{s.builtin ? "内置" : "我的定义"}</div>
            </button>
          </li>
        ))}
      </ul>
      <div className="min-w-0 space-y-3">
        <p className="text-muted-foreground text-sm">{current.description}</p>
        <WorkflowGraph graph={graph} />
        <div className="grid gap-2 sm:grid-cols-2">
          {graph.agents.map((a) => (
            <div key={a.name} className="bg-card rounded-lg border p-2 text-xs">
              <b>{a.name}</b> · {a.role}
              <div className="text-muted-foreground">
                技能 {a.skill} · 模型 {a.model_tier === "fast" ? "轻量" : "强"}
                {a.independent ? " · 独立核查（看不到撰稿推理）" : ""}
              </div>
            </div>
          ))}
        </div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          className="h-72 font-mono text-xs"
          aria-label="工作流定义（YAML）"
        />
        {check && (
          <p className={`text-sm ${check.ok ? "text-emerald-600" : "text-red-600"}`}>
            {check.ok ? `校验通过：工作流「${check.name}」，上方图已按当前文本刷新` : check.error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void validate()}>
            校验
          </Button>
          <Button size="sm" disabled={busy || !check?.ok} onClick={() => void save()}>
            保存为我的定义
          </Button>
          {!current.builtin && (
            <Button variant="outline" size="sm" onClick={() => void specs.remove(current.name)}>
              删除
            </Button>
          )}
          <span className="text-muted-foreground self-center text-xs">
            内置定义不可覆盖：改工作流名称后保存即得到自己的版本，校验会拦下循环依赖、缺失的 Agent
            和越权的核查员。
          </span>
        </div>
      </div>
    </div>
  );
}
