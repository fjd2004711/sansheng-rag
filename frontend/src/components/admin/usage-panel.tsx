"use client";

import { useEffect, useState } from "react";

import { Skeleton } from "@/components/ui";
import { apiClient } from "@/lib/api-client";
import { formatTokens } from "@/lib/format-tokens";

interface Row {
  email: string;
  source: "server" | "custom";
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  records: number;
}

/** Per-user token totals (last 30 days). "系统模型" is what the server's own quota paid for. */
export function UsagePanel() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiClient
      .get<{ items: Row[] }>("/v1/usage/admin", { params: { days: "30" } })
      .then((data) => setRows(data.items))
      .catch(() => setError(true));
  }, []);

  if (error) return <p className="text-destructive text-sm">读取用量失败</p>;
  if (!rows) return <Skeleton className="h-32 w-full" />;
  const serverTotal = rows.filter((r) => r.source === "server").reduce((sum, r) => sum + r.total_tokens, 0);

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        近 30 天，系统模型共消耗 <b className="text-foreground">{formatTokens(serverTotal)}</b> tokens。用户自配模型的用量由其自己的 Key 承担。
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-left text-xs">
            <tr>
              <th className="px-3 py-2 font-medium">用户</th>
              <th className="px-3 py-2 font-medium">模型来源</th>
              <th className="px-3 py-2 text-right font-medium">输入</th>
              <th className="px-3 py-2 text-right font-medium">输出</th>
              <th className="px-3 py-2 text-right font-medium">合计</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={`${row.email}-${row.source}`}>
                <td className="px-3 py-2">{row.email}</td>
                <td className="px-3 py-2">{row.source === "custom" ? "自配模型" : "系统模型"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatTokens(row.prompt_tokens)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatTokens(row.completion_tokens)}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{formatTokens(row.total_tokens)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="text-muted-foreground px-3 py-6 text-center">
                  还没有用量记录
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
