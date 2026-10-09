"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Skeleton } from "@/components/ui";
import { useAuth } from "@/hooks";
import { apiClient } from "@/lib/api-client";
import { formatTokens } from "@/lib/format-tokens";
import { TRACE_FAILURE_LABELS } from "@/lib/agent-trace-labels";
import { cn, isAppAdmin } from "@/lib/utils";

import { BenchmarkDashboard } from "./evaluation-dashboard";

type Verdict = "verified" | "corrected" | "partial" | "abstained" | "unchecked";

interface Quality {
  days: number;
  scope: "mine" | "all";
  answers: number;
  verdicts: Partial<Record<Verdict, number>>;
  avg_groundedness: number | null;
  avg_completeness: number | null;
  avg_citation_coverage: number | null;
  correction_rate: number | null;
  avg_searches: number | null;
  latency_p50_s: number | null;
  latency_p90_s: number | null;
  avg_tokens: number | null;
  rated: number;
  helpful: number;
  failure_types: Record<string, number>;
  by_day: Array<{ day: string; answers: number; passed: number; avg_groundedness: number | null }>;
  attention: Array<{
    message_id: string;
    conversation_id: string;
    question: string;
    verdict: Verdict;
    groundedness: number | null;
    reason: string | null;
    rating: number | null;
    created_at: string;
  }>;
}

const VERDICTS: Array<{ key: Verdict; label: string; bar: string }> = [
  { key: "verified", label: "一次通过核对", bar: "bg-emerald-500" },
  { key: "corrected", label: "纠错后通过", bar: "bg-sky-500" },
  { key: "partial", label: "仅部分有依据", bar: "bg-amber-500" },
  { key: "abstained", label: "没有找到答案", bar: "bg-zinc-400" },
  { key: "unchecked", label: "未核对", bar: "bg-rose-400" },
];
const RANGES = [7, 30, 90];
const MIN_RELIABLE = 20;
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const secs = (v: number | null) => (v === null ? "—" : `${v} 秒`);

/** How the assistant is actually doing for this person's questions — computed from stored answers, nothing hand-entered. */
export function QualityDashboard() {
  const { user } = useAuth();
  const admin = isAppAdmin(user);
  const [days, setDays] = useState(30);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [data, setData] = useState<Quality | null>(null);
  const [error, setError] = useState(false);
  // The chart library only loads once the benchmark section is opened.
  const [benchmarkOpened, setBenchmarkOpened] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(false);
    apiClient
      .get<Quality>("/v1/quality", { params: { days: String(days), scope } })
      .then((result) => !cancelled && setData(result))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [days, scope]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">回答质量</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            根据{scope === "all" ? "所有用户" : "你"}实际的提问统计：每条回答都经过检索、核对，这里汇总结果。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {admin && (
            <Segmented
              value={scope}
              onChange={setScope}
              options={[
                { value: "mine", label: "只看我的" },
                { value: "all", label: "所有用户" },
              ]}
            />
          )}
          <Segmented value={String(days)} onChange={(v) => setDays(Number(v))} options={RANGES.map((d) => ({ value: String(d), label: `近 ${d} 天` }))} />
        </div>
      </header>

      {error && <p className="text-destructive text-sm">读取失败，请稍后再试。</p>}
      {!data && !error && <Skeleton className="h-64 w-full rounded-xl" />}

      {data && data.answers === 0 && (
        <div className="rounded-xl border border-dashed py-16 text-center">
          <p className="text-sm font-medium">这段时间还没有记录</p>
          <p className="text-muted-foreground mt-1 text-xs">
            去<Link href="/chat" className="underline">对话</Link>里提几个问题，回答的质量就会出现在这里。
          </p>
        </div>
      )}

      {data && data.answers > 0 && <Body data={data} />}

      {admin && (
        <details className="rounded-xl border" onToggle={(event) => event.currentTarget.open && setBenchmarkOpened(true)}>
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">离线基准测试（管理员）</summary>
          <div className="text-muted-foreground border-t px-4 py-3 text-xs leading-relaxed">
            固定题库与固定语料，由脚本 <code>eval/run_p5_evaluation.py</code> 生成，用来比较各检索与纠错策略，<b>不代表真实使用情况</b>。展开时才会加载。
          </div>
          {benchmarkOpened && <BenchmarkDashboard />}
        </details>
      )}
    </div>
  );
}

function Body({ data }: { data: Quality }) {
  const total = data.answers;
  const passed = (data.verdicts.verified ?? 0) + (data.verdicts.corrected ?? 0);
  const peak = Math.max(1, ...data.by_day.map((d) => d.answers));
  const failures = Object.entries(data.failure_types).sort((a, b) => b[1] - a[1]);

  return (
    <>
      {total < MIN_RELIABLE && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs">
          目前只有 {total} 条回答，样本太少，下面的比例波动会很大，仅供参考。
        </p>
      )}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">{total} 条回答的核对结果</h2>
          <span className="text-muted-foreground text-xs">通过核对 {pct(passed / total)}</span>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label="核对结果分布">
          {VERDICTS.map(({ key, bar }) => {
            const n = data.verdicts[key] ?? 0;
            return n > 0 ? <span key={key} className={bar} style={{ width: `${(n / total) * 100}%` }} title={`${n} 条`} /> : null;
          })}
        </div>
        <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {VERDICTS.map(({ key, label, bar }) => (
            <li key={key} className="flex items-center gap-2">
              <span className={cn("h-2.5 w-2.5 rounded-sm", bar)} />
              {label}
              <span className="text-muted-foreground ml-auto tabular-nums">{data.verdicts[key] ?? 0}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="回答有据可查" value={pct(data.avg_groundedness)} hint="说法在资料里找得到依据的平均比例" />
        <Kpi label="回答完整" value={pct(data.avg_completeness)} hint="问题的各方面都答到了的平均比例" />
        <Kpi label="需要自我纠错" value={pct(data.correction_rate)} hint={`平均检索 ${data.avg_searches ?? "—"} 次`} />
        <Kpi
          label="用户认为有帮助"
          value={data.rated > 0 ? pct(data.helpful / data.rated) : "—"}
          hint={data.rated > 0 ? `${data.rated} 条有评价` : "还没有人评价"}
        />
        <Kpi label="回答耗时（中位）" value={secs(data.latency_p50_s)} hint={`最慢的 10% 超过 ${secs(data.latency_p90_s)}`} />
        <Kpi label="每条回答的 Token" value={data.avg_tokens === null ? "—" : formatTokens(data.avg_tokens)} hint="含检索评审、核对和追问建议" />
        <Kpi label="引用覆盖" value={pct(data.avg_citation_coverage)} hint="说法都标了出处的平均比例" />
      </section>

      {data.by_day.length > 1 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">每天的回答数与通过率</h2>
          <div className="flex h-28 items-end gap-1" role="img" aria-label="每日回答数">
            {data.by_day.map((d) => (
              <div key={d.day} className="flex min-w-[6px] flex-1 flex-col justify-end" title={`${d.day}：${d.answers} 条，通过 ${d.passed} 条`}>
                <span className="bg-muted rounded-t" style={{ height: `${(d.answers / peak) * 100}%` }}>
                  <span className="bg-emerald-500/70 block rounded-t" style={{ height: `${d.answers ? (d.passed / d.answers) * 100 : 0}%`, marginTop: "auto" }} />
                </span>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">灰色是当天的回答数，绿色是其中通过核对的部分。</p>
        </section>
      )}

      {failures.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">核对没通过时，最常见的原因</h2>
          <ul className="divide-y rounded-lg border text-sm">
            {failures.map(([type, n]) => (
              <li key={type} className="flex justify-between px-3 py-2">
                <span>{TRACE_FAILURE_LABELS[type] ?? type}</span>
                <span className="text-muted-foreground tabular-nums">{n} 次</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.attention.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">值得回头看看的回答</h2>
          <ul className="divide-y rounded-lg border">
            {data.attention.map((item) => (
              <li key={item.message_id} className="px-3 py-2.5 text-sm">
                <Link href={`/chat?id=${item.conversation_id}`} className="font-medium underline-offset-2 hover:underline">
                  {item.question || "（找不到原问题）"}
                </Link>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {VERDICTS.find((v) => v.key === item.verdict)?.label}
                  {item.groundedness !== null && ` · 有据可查 ${pct(item.groundedness)}`}
                  {item.rating === -1 && " · 被评为有问题"}
                  {item.reason && ` · ${item.reason}`}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border px-4 py-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div role="radiogroup" className="bg-muted/60 inline-flex rounded-lg p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md px-3 py-1 text-xs transition-colors",
            value === option.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
