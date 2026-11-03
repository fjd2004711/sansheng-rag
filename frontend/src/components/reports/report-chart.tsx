"use client";

import type { EChartsType } from "echarts";
import { useEffect, useRef } from "react";

import type { ReportSectionData } from "@/types/report";

type Chart = NonNullable<ReportSectionData["chart"]>;

function isDark(): boolean {
  const root = document.documentElement;
  if (root.classList.contains("dark")) return true;
  if (root.classList.contains("light")) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Trend line of one indicator, built only from verbatim-checked data points. */
export function ReportChart({ chart }: { chart: Chart }) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let instance: EChartsType | undefined;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void import("echarts").then((echarts) => {
      if (!element.current || disposed) return;
      const dark = isDark();
      const text = dark ? "#a8a8b3" : "#52525b";
      const grid = dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
      const accent = "#3b82f6";
      instance = echarts.init(element.current);
      instance.setOption({
        animationDuration: 700,
        textStyle: { color: text },
        title: {
          text: chart.title,
          left: 0,
          textStyle: { fontSize: 13, fontWeight: 600, color: dark ? "#f4f4f5" : "#18181b" },
        },
        tooltip: {
          trigger: "axis",
          backgroundColor: dark ? "#27272a" : "#ffffff",
          borderColor: grid,
          textStyle: { color: dark ? "#f4f4f5" : "#18181b" },
        },
        ...(chart.kind === "pie"
          ? {}
          : {
              grid: { left: 8, right: 16, top: 64, bottom: 8, containLabel: true },
              xAxis: {
                type: "category",
                data: chart.labels,
                boundaryGap: chart.kind === "bar",
                axisLine: { lineStyle: { color: grid } },
                axisLabel: { color: text, interval: 0, width: 90, overflow: "break" },
              },
              yAxis: {
                type: "value",
                name: chart.unit,
                nameTextStyle: { color: text, align: "left" },
                scale: chart.kind !== "bar", // bars start at zero, or the short ones look far smaller than they are
                splitLine: { lineStyle: { color: grid } },
                axisLabel: { color: text },
              },
            }),
        series: [
          chart.kind === "pie"
            ? {
                type: "pie",
                radius: ["38%", "66%"],
                center: ["50%", "56%"],
                data: chart.labels.map((name, i) => ({ name, value: chart.values[i] })),
                label: { color: text, formatter: "{b}\n{d}%", fontSize: 11 },
                itemStyle: { borderColor: dark ? "#18181b" : "#fff", borderWidth: 2 },
                color: ["#3b82f6", "#64748b", "#94a3b8", "#0ea5e9", "#a1a1aa", "#cbd5e1"],
              }
            : chart.kind === "bar"
              ? {
                  type: "bar",
                  data: chart.values,
                  barMaxWidth: 40,
                  itemStyle: { color: accent, borderRadius: [3, 3, 0, 0] },
                  label: { show: true, position: "top", color: text, fontSize: 11 },
                }
              : {
                  type: "line",
                  data: chart.values,
                  symbolSize: 6,
                  lineStyle: { width: 2, color: accent },
                  itemStyle: { color: accent },
                  label: { show: true, position: "top", color: text, fontSize: 11 },
                },
        ],
      });
      const resize = () => instance?.resize();
      window.addEventListener("resize", resize);
      cleanup = () => window.removeEventListener("resize", resize);
    });
    return () => {
      disposed = true;
      cleanup?.();
      instance?.dispose();
    };
  }, [chart]);
  return (
    <figure className="bg-card my-3 rounded-lg border p-3">
      <div ref={element} className="h-64 w-full" />
      <figcaption className="text-muted-foreground mt-1 text-right text-xs">
        数据来源：{chart.sources.map((n) => `[${n}]`).join("")}
      </figcaption>
    </figure>
  );
}
