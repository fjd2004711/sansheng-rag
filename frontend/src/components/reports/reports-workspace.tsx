"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button, Input } from "@/components/ui";
import { useReports } from "@/hooks/use-reports";
import { getErrorMessage } from "@/lib/utils";

import { ReportList } from "./report-list";
import { ReportView } from "./report-view";

const EXAMPLES = [
  "2025年大学生就业数据",
  "中国新能源汽车产销与渗透率",
  "全国居民人均可支配收入变化",
];

/** Start a research report, follow its progress, read it and download Word / PDF. */
export function ReportsWorkspace() {
  const params = useSearchParams();
  const [topic, setTopic] = useState(params.get("topic") ?? "");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(params.get("id"));
  const { items, loading, create, remove } = useReports();
  const current = items.find((item) => item.id === selected) ?? items[0] ?? null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (topic.trim().length < 2) return;
    setBusy(true);
    try {
      const report = await create(topic.trim());
      setSelected(report.id);
      setTopic("");
      toast.success("已开始生成，通常需要 3～6 分钟，可以先离开本页");
    } catch (error) {
      toast.error(getErrorMessage(error, "创建报告失败"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-4 p-3 sm:p-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <form onSubmit={submit} className="bg-card space-y-3 rounded-xl border p-4">
          <div>
            <h1 className="text-base font-semibold">调研报告</h1>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              输入主题，系统会优先查找政府、统计部门和研究机构的公开数据，逐条核对后生成带数据表、趋势图和分析的报告，可下载
              Word 或 PDF。
            </p>
          </div>
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="例如：2025年大学生就业数据"
            maxLength={200}
          />
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setTopic(example)}
                className="bg-muted hover:bg-muted/70 rounded-full px-2 py-0.5 text-xs"
              >
                {example}
              </button>
            ))}
          </div>
          <Button type="submit" className="w-full" disabled={busy || topic.trim().length < 2}>
            {busy ? "正在提交…" : "生成报告"}
          </Button>
        </form>
        <ReportList
          items={items}
          loading={loading}
          selectedId={current?.id ?? null}
          onSelect={setSelected}
          onDelete={remove}
        />
      </aside>
      <section className="min-w-0">
        {current ? (
          <ReportView summary={current} />
        ) : (
          <div className="text-muted-foreground bg-card flex h-64 items-center justify-center rounded-xl border text-sm">
            还没有报告。在左侧输入主题开始。
          </div>
        )}
      </section>
    </div>
  );
}
