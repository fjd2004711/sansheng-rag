"use client";

import { useEffect, useRef, useState } from "react";
import type { EChartsType } from "echarts";
import { BarChart3, Loader2, RefreshCw } from "lucide-react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";

type MetricMap = Record<string, number>;
type Mode = { name: string; metrics: MetricMap; rows: Array<Record<string, unknown>> };
type Ablation = { component: string; metric: string; with_component: number; without_component: number };
type Report = { methodology: string; scenario_count: number; corpus_document_count: number; modes: Mode[]; ablations: Ablation[] };

const comparisonKeys = ["Recall@5", "MRR", "nDCG", "Groundedness", "Completeness", "Corrective Success Rate"];

function Chart({ option }: { option: Record<string, unknown> }) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let chart: EChartsType | undefined;
    let disposed = false;
    const draw = async () => {
      const echarts = await import("echarts");
      if (!element.current || disposed) return;
      chart = echarts.init(element.current);
      chart.setOption(option);
      const resize = () => chart?.resize();
      window.addEventListener("resize", resize);
      return () => window.removeEventListener("resize", resize);
    };
    let cleanup: (() => void) | undefined;
    draw().then((fn) => { cleanup = fn; });
    return () => {
      disposed = true;
      cleanup?.();
      chart?.dispose();
    };
  }, [option]);
  return <div ref={element} className="h-80 w-full" />;
}

export function EvaluationDashboard() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    setError(null);
    try {
      const response = await fetch("/evaluation/p5-report.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Report is unavailable");
      setReport(await response.json());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load report");
    }
  };
  useEffect(() => { load(); }, []);

  if (error) return <div className="rounded-xl border border-destructive/30 p-6 text-destructive">{error}</div>;
  if (!report) return <div className="flex h-72 items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading evaluation report…</div>;

  const names = report.modes.map((mode) => mode.name);
  const comparisonOption = {
    tooltip: { trigger: "axis" },
    legend: { bottom: 0 },
    grid: { left: 42, right: 16, top: 30, bottom: 72 },
    xAxis: { type: "category", data: comparisonKeys, axisLabel: { interval: 0, rotate: 24 } },
    yAxis: { type: "value", min: 0, max: 1, axisLabel: { formatter: "{value}" } },
    series: report.modes.map((mode) => ({ name: mode.name, type: "bar", data: comparisonKeys.map((key) => mode.metrics[key] ?? 0) })),
  };
  const ablationOption = {
    tooltip: { trigger: "axis" },
    legend: { bottom: 0 },
    grid: { left: 42, right: 16, top: 30, bottom: 62 },
    xAxis: { type: "category", data: report.ablations.map((item) => item.component), axisLabel: { interval: 0, rotate: 22 } },
    yAxis: { type: "value", min: 0, max: 1 },
    series: [
      { name: "With component", type: "bar", data: report.ablations.map((item) => item.with_component) },
      { name: "Without component", type: "bar", data: report.ablations.map((item) => item.without_component) },
    ],
  };
  const operationalOption = {
    tooltip: { trigger: "axis" },
    legend: { bottom: 0 },
    grid: { left: 52, right: 16, top: 30, bottom: 54 },
    xAxis: { type: "category", data: names, axisLabel: { interval: 0, rotate: 14 } },
    yAxis: [
      { type: "value", name: "Latency (ms)" },
      { type: "value", name: "Rounds", min: 0 },
    ],
    series: [
      { name: "Latency (ms)", type: "bar", data: report.modes.map((mode) => mode.metrics["Latency (ms)"] ?? 0) },
      { name: "Average Retrieval Rounds", type: "line", yAxisIndex: 1, data: report.modes.map((mode) => mode.metrics["Average Retrieval Rounds"] ?? 0) },
    ],
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Evaluation Dashboard</h1><p className="text-muted-foreground">P5 reproducible comparison and ablation report.</p></div>
        <Button variant="outline" onClick={load}><RefreshCw className="mr-2 h-4 w-4" />Refresh report</Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardDescription>Scenarios</CardDescription><CardTitle>{report.scenario_count}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Evaluation corpus</CardDescription><CardTitle>{report.corpus_document_count} documents</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Modes compared</CardDescription><CardTitle>{report.modes.length}</CardTitle></CardHeader></Card>
      </div>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />Quality comparison</CardTitle><CardDescription>Retrieval and answer-quality metrics, calculated by the evaluation runner.</CardDescription></CardHeader><CardContent><Chart option={comparisonOption} /></CardContent></Card>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>Ablation study</CardTitle><CardDescription>Measured impact of each required component.</CardDescription></CardHeader><CardContent><Chart option={ablationOption} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Cost and correction depth</CardTitle><CardDescription>Latency includes local-model grading and bounded correction passes.</CardDescription></CardHeader><CardContent><Chart option={operationalOption} /></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Scenario outcomes</CardTitle><CardDescription>{report.methodology}</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b text-left text-muted-foreground"><tr><th className="p-2">Mode</th><th className="p-2">Scenario</th><th className="p-2">Initial rank</th><th className="p-2">Final rank</th><th className="p-2">Rounds</th><th className="p-2">Abstained</th></tr></thead><tbody>{report.modes.flatMap((mode) => mode.rows.map((row) => <tr className="border-b last:border-0" key={mode.name + String(row.id)}><td className="p-2 font-medium">{mode.name}</td><td className="p-2">{String(row.id)}</td><td className="p-2">{String(row.initial_rank ?? "—")}</td><td className="p-2">{String(row.rank ?? "—")}</td><td className="p-2">{String(row.rounds)}</td><td className="p-2">{row.abstained ? "Yes" : "No"}</td></tr>))}</tbody></table></div></CardContent></Card>
    </div>
  );
}
