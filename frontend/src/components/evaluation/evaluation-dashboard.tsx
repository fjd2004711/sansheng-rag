"use client";

import { useEffect, useRef, useState } from "react";
import type { EChartsType } from "echarts";
import { ArrowRight, Info, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

type MetricMap = Record<string, number>;
type Row = Record<string, unknown>;
type Mode = { name: string; metrics: MetricMap; rows: Row[] };
type Ablation = { component: string; metric: string; with_component: number; without_component: number };
type Report = { methodology: string; scenario_count: number; corpus_document_count: number; modes: Mode[]; ablations: Ablation[] };

// Report keys stay exactly as the evaluation script wrote them; only the display names are Chinese.
const MODE_INFO: Record<string, { name: string; text: string }> = {
  "Baseline RAG": { name: "基础检索", text: "只做向量检索，找到什么用什么" },
  "Hybrid RAG": { name: "混合检索", text: "再加关键词检索并融合排序、重排序" },
  "Corrective RAG": { name: "检索纠错", text: "找得不好时，分析原因并换个问法重找" },
  "Full Self-Correcting RAG": { name: "完整自纠错", text: "再加上回答核对：有问题就纠正或如实拒答" },
};
const METRIC_NAMES: Record<string, string> = {
  "Recall@5": "找到正确资料",
  MRR: "正确资料排得靠前",
  nDCG: "整体排序质量",
  Groundedness: "回答有据可查",
  Completeness: "回答完整",
  "Corrective Success Rate": "纠错成功",
  "Abstention Accuracy": "该拒答时拒答",
  "Retrieval Corrective Success Rate": "检索纠错成功",
};
const COMPONENT_NAMES: Record<string, string> = {
  BM25: "关键词检索",
  Reranker: "重排序",
  "Evidence Judge": "资料评审",
  "Query Rewrite": "查询改写",
  "Groundedness Judge": "依据核查",
  "Completeness Judge": "完整度核查",
};
const HEADLINES: Array<{ key: string; title: string; question: string }> = [
  { key: "Recall@5", title: "找到正确资料", question: "前 5 条里有没有标准答案所在的资料" },
  { key: "Groundedness", title: "回答有据可查", question: "回答里的说法能不能在资料里找到依据" },
  { key: "Abstention Accuracy", title: "该拒答时拒答", question: "资料里没有答案时，是否老实说不知道" },
];
const CHART_KEYS = ["Recall@5", "Groundedness", "Completeness", "Abstention Accuracy"];

const percent = (value: number | undefined) => `${Math.round((value ?? 0) * 100)}%`;
const modeName = (name: string) => MODE_INFO[name]?.name ?? name;

function Chart({ option }: { option: Record<string, unknown> }) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let chart: EChartsType | undefined;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void import("echarts").then((echarts) => {
      if (!element.current || disposed) return;
      chart = echarts.init(element.current);
      chart.setOption(option);
      const resize = () => chart?.resize();
      window.addEventListener("resize", resize);
      cleanup = () => window.removeEventListener("resize", resize);
    });
    return () => {
      disposed = true;
      cleanup?.();
      chart?.dispose();
    };
  }, [option]);
  return <div ref={element} className="h-80 w-full" />;
}

function Headline({ title, question, from, to }: { title: string; question: string; from: number; to: number }) {
  return (
    <div className="bg-card rounded-xl border p-4">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-muted-foreground mt-0.5 text-xs">{question}</p>
      <p className="mt-3 flex items-center gap-2 text-2xl font-semibold tabular-nums">
        <span className="text-muted-foreground">{percent(from)}</span>
        <ArrowRight className="text-muted-foreground h-4 w-4" />
        <span className={cn(to > from ? "text-emerald-600" : "")}>{percent(to)}</span>
      </p>
      <p className="text-muted-foreground mt-1 text-xs">基础检索 → 完整自纠错</p>
    </div>
  );
}

function CompareBar({ label, without, withValue }: { label: string; without: number; withValue: number }) {
  const drop = withValue - without;
  return (
    <li className="space-y-1.5 rounded-xl border p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        <p className={cn("text-xs font-medium", drop > 0 ? "text-emerald-600" : "text-muted-foreground")}>
          {drop > 0 ? `作用：+${Math.round(drop * 100)} 个百分点` : "在这批题里没有体现出作用"}
        </p>
      </div>
      {[
        { text: "有这个组件", value: withValue, tone: "bg-emerald-500" },
        { text: "拿掉它", value: without, tone: "bg-muted-foreground/40" },
      ].map((bar) => (
        <div key={bar.text} className="flex items-center gap-3 text-xs">
          <span className="text-muted-foreground w-16 shrink-0">{bar.text}</span>
          <span className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
            <span className={cn("block h-full rounded-full", bar.tone)} style={{ width: `${Math.round(bar.value * 100)}%` }} />
          </span>
          <span className="w-10 text-right tabular-nums">{percent(bar.value)}</span>
        </div>
      ))}
    </li>
  );
}

export function BenchmarkDashboard() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRows, setShowRows] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const response = await fetch("/evaluation/p5-report.json", { cache: "no-store" });
      if (!response.ok) throw new Error("评测报告暂时无法读取");
      setReport(await response.json());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "评测报告加载失败");
    }
  };
  useEffect(() => {
    void load();
  }, []);

  if (error) return <div className="text-destructive mx-auto max-w-5xl p-6">{error}</div>;
  if (!report)
    return (
      <div className="text-muted-foreground flex h-72 items-center justify-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> 正在加载评测报告…
      </div>
    );

  const first = report.modes[0];
  const last = report.modes[report.modes.length - 1];
  const chartOption = {
    tooltip: { trigger: "axis", valueFormatter: (value: number) => percent(value) },
    legend: { top: 0 },
    grid: { left: 48, right: 16, top: 48, bottom: 32 },
    xAxis: { type: "category", data: CHART_KEYS.map((key) => METRIC_NAMES[key]) },
    yAxis: { type: "value", min: 0, max: 1, axisLabel: { formatter: (value: number) => percent(value) } },
    series: report.modes.map((mode) => ({
      name: modeName(mode.name),
      type: "bar",
      barMaxWidth: 36,
      data: CHART_KEYS.map((key) => mode.metrics[key] ?? 0),
      label: { show: true, position: "top", formatter: ({ value }: { value: number }) => percent(value), fontSize: 11 },
    })),
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">效果评测</h1>
        <p className="text-muted-foreground mt-1 text-sm">用同一批题目对比四种做法，再逐个拿掉关键组件，看「自纠错」到底有没有用。</p>
      </header>

      <div className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm leading-relaxed">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p>
          请这样理解这些数字：目前只有 <strong>{report.scenario_count} 道专门设计的难题</strong>、
          <strong>{report.corpus_document_count} 份文档</strong>，目的是证明纠错流程<strong>确实在起作用</strong>
          ，而不是推算真实使用时的准确率。题目少，所以数字不是 0% 就是 100%，请不要当成统计结论。所有数值都由评测脚本自动算出，没有手填。
        </p>
      </div>

      {first && last && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">一眼看结论</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {HEADLINES.map((item) => (
              <Headline key={item.key} title={item.title} question={item.question} from={first.metrics[item.key] ?? 0} to={last.metrics[item.key] ?? 0} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">四种做法</h2>
        <ol className="grid gap-3 sm:grid-cols-2">
          {report.modes.map((mode, index) => (
            <li key={mode.name} className="rounded-xl border p-3.5">
              <p className="text-sm font-medium">
                {index + 1}. {modeName(mode.name)}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">{MODE_INFO[mode.name]?.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">四种做法的对比</h2>
        <p className="text-muted-foreground text-sm">数值越高越好；柱子上直接标了百分比，0% 也会显示出来。</p>
        <div className="rounded-xl border p-4">
          <Chart option={chartOption} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">拿掉某个组件会怎样</h2>
        <p className="text-muted-foreground text-sm">逐个关掉关键组件重测，看分数掉多少，就能知道它值不值得保留。</p>
        <ul className="grid gap-3 md:grid-cols-2">
          {report.ablations.map((item) => (
            <CompareBar key={item.component} label={`${COMPONENT_NAMES[item.component] ?? item.component}（看「${METRIC_NAMES[item.metric] ?? item.metric}」）`} without={item.without_component} withValue={item.with_component} />
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">纠错要多花多少时间</h2>
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-left text-xs">
              <tr>
                <th className="px-4 py-2.5 font-medium">做法</th>
                <th className="px-4 py-2.5 font-medium">平均耗时</th>
                <th className="px-4 py-2.5 font-medium">平均检索轮数</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.modes.map((mode) => (
                <tr key={mode.name}>
                  <td className="px-4 py-3 font-medium">{modeName(mode.name)}</td>
                  <td className="px-4 py-3 tabular-nums">{((mode.metrics["Latency (ms)"] ?? 0) / 1000).toFixed(1)} 秒</td>
                  <td className="px-4 py-3 tabular-nums">{(mode.metrics["Average Retrieval Rounds"] ?? 0).toFixed(1)} 轮</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground text-xs">纠错会多花一些时间，但检索和回答的轮数都有上限，不会无休止地重试。</p>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">逐道题的结果</h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowRows((value) => !value)}>
              {showRows ? "收起" : "展开"}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()}>
              <RefreshCw className="h-3.5 w-3.5" />
              刷新报告
            </Button>
          </div>
        </div>
        {showRows && (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-left text-xs">
                <tr>
                  <th className="px-4 py-2.5 font-medium">做法</th>
                  <th className="px-4 py-2.5 font-medium">题目</th>
                  <th className="px-4 py-2.5 font-medium">第一次检索时正确资料排第几</th>
                  <th className="px-4 py-2.5 font-medium">纠错后排第几</th>
                  <th className="px-4 py-2.5 font-medium">检索轮数</th>
                  <th className="px-4 py-2.5 font-medium">是否拒答</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.modes.flatMap((mode) =>
                  mode.rows.map((row) => (
                    <tr key={mode.name + String(row.id)}>
                      <td className="px-4 py-2.5 font-medium">{modeName(mode.name)}</td>
                      <td className="px-4 py-2.5">{String(row.id)}</td>
                      <td className="px-4 py-2.5">{row.initial_rank == null ? "没找到" : `第 ${String(row.initial_rank)} 位`}</td>
                      <td className="px-4 py-2.5">{row.rank == null ? "没找到" : `第 ${String(row.rank)} 位`}</td>
                      <td className="px-4 py-2.5">{String(row.rounds)}</td>
                      <td className="px-4 py-2.5">{row.abstained ? "是" : "否"}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
