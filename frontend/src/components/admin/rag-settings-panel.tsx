"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button, Switch } from "@/components/ui";
import { apiClient } from "@/lib/api-client";
import { getErrorMessage } from "@/lib/utils";

interface RagSettings {
  correction_enabled: boolean;
  max_correction_rounds: number;
  generation_correction_enabled: boolean;
  max_generation_corrections: number;
  reranker_enabled: boolean;
}

/** The correction loop's knobs. Takes effect immediately and survives restarts; round counts stay capped. */
export function RagSettingsPanel() {
  const [value, setValue] = useState<RagSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get<RagSettings>("/v1/rag-settings").then(setValue).catch(() => toast.error("读取参数失败"));
  }, []);

  if (!value) return <p className="text-muted-foreground text-sm">读取中…</p>;
  const set = <K extends keyof RagSettings>(key: K, next: RagSettings[K]) => setValue({ ...value, [key]: next });

  const save = async () => {
    setSaving(true);
    try {
      setValue(await apiClient.put<RagSettings>("/v1/rag-settings", value));
      toast.success("已保存，立即生效");
    } catch (error) {
      toast.error(getErrorMessage(error, "保存失败"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl space-y-5">
      <p className="text-muted-foreground text-sm">
        调这些参数会改变所有用户的回答流程：关掉核对会更快，但回答不再逐条检查；纠错轮数有硬上限，不会无限重试。
      </p>
      <Row title="资料不够时自动换问法重搜" hint="检索后先判断资料够不够用，不够就分析原因、改写搜索词再找">
        <Switch checked={value.correction_enabled} onCheckedChange={(on) => set("correction_enabled", on)} />
      </Row>
      <Row title="最多检索轮数" hint="1–3 轮；越多越可能找到，也越慢">
        <Stepper value={value.max_correction_rounds} min={1} max={3} onChange={(n) => set("max_correction_rounds", n)} disabled={!value.correction_enabled} />
      </Row>
      <Row title="回答后逐条核对" hint="检查每个说法有没有资料依据；关掉后回答立即显示，但不再核对">
        <Switch checked={value.generation_correction_enabled} onCheckedChange={(on) => set("generation_correction_enabled", on)} />
      </Row>
      <Row title="核对不通过时最多纠正几次" hint="1–2 次">
        <Stepper value={value.max_generation_corrections} min={1} max={2} onChange={(n) => set("max_generation_corrections", n)} disabled={!value.generation_correction_enabled} />
      </Row>
      <Row title="用模型对候选资料重排序" hint="提升排序准确度，每次提问多一次模型调用">
        <Switch checked={value.reranker_enabled} onCheckedChange={(on) => set("reranker_enabled", on)} />
      </Row>
      <Button onClick={() => void save()} disabled={saving}>
        保存
      </Button>
    </div>
  );
}

function Row({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground text-xs">{hint}</p>
      </div>
      {children}
    </div>
  );
}

function Stepper({ value, min, max, onChange, disabled }: { value: number; min: number; max: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <button type="button" disabled={disabled || value <= min} onClick={() => onChange(value - 1)} aria-label="减一" className="h-7 w-7 rounded-md border disabled:opacity-40">
        −
      </button>
      <span className="w-4 text-center tabular-nums">{value}</span>
      <button type="button" disabled={disabled || value >= max} onClick={() => onChange(value + 1)} aria-label="加一" className="h-7 w-7 rounded-md border disabled:opacity-40">
        +
      </button>
    </span>
  );
}
