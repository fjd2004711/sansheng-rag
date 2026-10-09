"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api-client";
import { getErrorMessage } from "@/lib/utils";

interface Candidate {
  id: string;
  question: string;
  expected_phrase: string;
  abstain: boolean;
  note: string | null;
  created_at: string;
}

/** Real questions queued for the evaluation set. Exported as lines for eval/p5-scenarios.jsonl. */
export function EvalCandidatesPanel() {
  const [items, setItems] = useState<Candidate[] | null>(null);

  const load = useCallback(() => {
    apiClient
      .get<{ items: Candidate[] }>("/v1/eval-candidates")
      .then((data) => setItems(data.items))
      .catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);

  const exportFile = async () => {
    try {
      const response = await fetch("/api/v1/eval-candidates/export", { credentials: "include" });
      if (!response.ok) throw new Error("导出失败");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "eval-candidates.jsonl";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(getErrorMessage(error, "导出失败"));
    }
  };

  const remove = async (id: string) => {
    try {
      await apiClient.delete(`/v1/eval-candidates/${id}`);
      load();
    } catch (error) {
      toast.error(getErrorMessage(error, "删除失败"));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          在“用户反馈”里点“加入评测集”，把真实问题和正确答案的关键词存到这里。导出后追加到 <code>eval/p5-scenarios.jsonl</code>
          ，并补上对应的资料，再运行评测脚本——指标仍由脚本生成。
        </p>
        <button
          type="button"
          onClick={() => void exportFile()}
          className="hover:bg-foreground/5 inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm"
        >
          <Download className="h-4 w-4" />
          导出
        </button>
      </div>
      <ul className="divide-y rounded-lg border">
        {(items ?? []).map((item) => (
          <li key={item.id} className="flex items-start gap-3 px-3 py-2.5 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{item.question}</p>
              <p className="text-muted-foreground text-xs">
                {item.abstain ? "应当拒答" : `答案须包含：${item.expected_phrase}`}
                {item.note ? ` · ${item.note}` : ""}
              </p>
            </div>
            <button type="button" onClick={() => void remove(item.id)} aria-label="删除" className="text-muted-foreground hover:text-destructive mt-0.5">
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
        {items && items.length === 0 && <li className="text-muted-foreground px-3 py-6 text-center text-sm">还没有候选问题</li>}
      </ul>
    </div>
  );
}
