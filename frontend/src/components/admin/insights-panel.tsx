"use client";

import { useEffect, useState } from "react";

import { Skeleton } from "@/components/ui";
import { apiClient } from "@/lib/api-client";

interface Insights {
  days: number;
  answers_analysed: number;
  abstained: number;
  partial: number;
  misses: Array<{
    message_id: string;
    question: string;
    kind: "abstained" | "partial";
    reason: string | null;
    user_email: string;
    created_at: string;
  }>;
  top_sources: Array<{ source: string; answers: number }>;
  never_retrieved: string[];
}

/** Where the knowledge base falls short: questions it could not (fully) answer, and documents that never help. */
export function InsightsPanel() {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiClient
      .get<Insights>("/v1/insights", { params: { days: "30" } })
      .then(setData)
      .catch(() => setError(true));
  }, []);

  if (error) return <p className="text-destructive text-sm">读取失败</p>;
  if (!data) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">
        近 {data.days} 天分析了 {data.answers_analysed} 条回答：<b className="text-foreground">{data.abstained}</b> 条因资料里没有而拒答，
        <b className="text-foreground">{data.partial}</b> 条只回答了一部分。把这些问题需要的资料补进资料库，是提升效果最直接的办法。
      </p>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">没答上的问题</h2>
        <ul className="divide-y rounded-lg border">
          {data.misses.map((miss) => (
            <li key={miss.message_id} className="space-y-0.5 px-3 py-2.5 text-sm">
              <p className="font-medium">{miss.question || "（找不到原问题）"}</p>
              <p className="text-muted-foreground text-xs">
                {miss.kind === "abstained" ? "拒答" : "部分回答"}
                {miss.reason ? ` · ${miss.reason}` : ""} · {miss.user_email} · {new Date(miss.created_at).toLocaleDateString("zh-CN")}
              </p>
            </li>
          ))}
          {data.misses.length === 0 && <li className="text-muted-foreground px-3 py-6 text-center text-sm">近期没有未答上的问题</li>}
        </ul>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">最常被用到的资料</h2>
          <ul className="divide-y rounded-lg border text-sm">
            {data.top_sources.map((row) => (
              <li key={row.source} className="flex justify-between gap-2 px-3 py-2">
                <span className="truncate" title={row.source}>
                  {row.source}
                </span>
                <span className="text-muted-foreground shrink-0">{row.answers} 次</span>
              </li>
            ))}
            {data.top_sources.length === 0 && <li className="text-muted-foreground px-3 py-4 text-center">暂无数据</li>}
          </ul>
        </section>
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">从未被检索到的资料</h2>
          <ul className="divide-y rounded-lg border text-sm">
            {data.never_retrieved.map((name) => (
              <li key={name} className="truncate px-3 py-2" title={name}>
                {name}
              </li>
            ))}
            {data.never_retrieved.length === 0 && <li className="text-muted-foreground px-3 py-4 text-center">每份资料都被用到过</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
