"use client";

import { useCallback, useEffect, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui";
import { apiClient } from "@/lib/api-client";
import { cn, getErrorMessage } from "@/lib/utils";

const REASON_LABELS: Record<string, string> = {
  wrong: "答错了",
  not_found: "资料里有，却没找到",
  bad_citation: "引用对不上",
  incomplete: "回答不完整",
  other: "其他",
};

interface FeedbackItem {
  id: string;
  rating: 1 | -1;
  reason: string | null;
  comment: string | null;
  created_at: string;
  user_email: string;
  message_id: string;
  question: string | null;
  answer: string;
}

interface FeedbackList {
  items: FeedbackItem[];
  total: number;
  helpful: number;
  not_helpful: number;
}

const FILTERS: Array<{ label: string; value: "" | "1" | "-1" }> = [
  { label: "全部", value: "" },
  { label: "有问题", value: "-1" },
  { label: "有帮助", value: "1" },
];

export function FeedbackPanel() {
  const [filter, setFilter] = useState<"" | "1" | "-1">("-1");
  const [data, setData] = useState<FeedbackList | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await apiClient.get<FeedbackList>(`/v1/feedback?limit=100${filter ? `&rating=${filter}` : ""}`));
    } catch (error) {
      toast.error(getErrorMessage(error, "加载反馈失败"));
      setData({ items: [], total: 0, helpful: 0, not_helpful: 0 });
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return <Skeleton className="h-48 w-full rounded-xl" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-muted-foreground text-sm">
          共 {data.total} 条反馈：<span className="text-emerald-600">{data.helpful} 条有帮助</span>，
          <span className="text-amber-600">{data.not_helpful} 条有问题</span>。有问题的回答是改进系统最有价值的材料。
        </p>
        <span className="ml-auto flex gap-1.5">
          {FILTERS.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => setFilter(item.value)}
              aria-pressed={filter === item.value}
              className={cn("rounded-full border px-3 py-1 text-xs", filter === item.value ? "border-foreground bg-foreground text-background" : "hover:bg-accent")}
            >
              {item.label}
            </button>
          ))}
        </span>
      </div>

      {data.items.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed py-14 text-center text-sm">还没有这类反馈。</div>
      ) : (
        <ul className="space-y-3">
          {data.items.map((item) => (
            <li key={item.id} className="space-y-2 rounded-xl border p-4">
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {item.rating === 1 ? <ThumbsUp className="h-4 w-4 text-emerald-600" /> : <ThumbsDown className="h-4 w-4 text-amber-600" />}
                {item.reason && <span className="bg-muted text-foreground rounded-full px-2 py-0.5">{REASON_LABELS[item.reason] ?? item.reason}</span>}
                <span>{item.user_email}</span>
                <span>{new Date(item.created_at).toLocaleString("zh-CN")}</span>
              </div>
              {item.comment && <p className="rounded-lg bg-amber-500/5 px-3 py-2 text-sm">“{item.comment}”</p>}
              <div className="space-y-1 text-sm">
                {item.question && (
                  <p>
                    <span className="text-muted-foreground">问：</span>
                    {item.question}
                  </p>
                )}
                <p className="text-foreground/80 line-clamp-4 whitespace-pre-wrap">
                  <span className="text-muted-foreground">答：</span>
                  {item.answer}
                </p>
              </div>
              {item.question && <AddToEval item={item} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Queue this question for the evaluation set, with what a correct answer must contain. */
function AddToEval({ item }: { item: FeedbackItem }) {
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [abstain, setAbstain] = useState(false);
  const [done, setDone] = useState(false);

  if (done) return <p className="text-xs text-emerald-600">已加入评测候选</p>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-muted-foreground hover:text-foreground text-xs underline">
        加入评测集
      </button>
    );
  }
  const submit = async () => {
    try {
      await apiClient.post("/v1/eval-candidates", {
        question: item.question,
        expected_phrase: phrase,
        abstain,
        source_message_id: item.message_id,
        note: item.reason ? REASON_LABELS[item.reason] : null,
      });
      setDone(true);
    } catch (error) {
      toast.error(getErrorMessage(error, "加入失败"));
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <input
        value={phrase}
        disabled={abstain}
        onChange={(event) => setPhrase(event.target.value)}
        placeholder="正确答案里必须出现的关键词"
        aria-label="正确答案关键词"
        className="bg-background min-w-[14rem] flex-1 rounded-lg border px-2.5 py-1 text-sm disabled:opacity-50"
      />
      <label className="flex items-center gap-1.5 text-xs">
        <input type="checkbox" checked={abstain} onChange={(event) => setAbstain(event.target.checked)} />
        应当拒答
      </label>
      <button
        type="button"
        disabled={!abstain && !phrase.trim()}
        onClick={() => void submit()}
        className="bg-foreground text-background rounded-lg px-3 py-1 text-xs disabled:opacity-40"
      >
        保存
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground text-xs">
        取消
      </button>
    </div>
  );
}
