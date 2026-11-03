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
      const accent = "#38bdf8";
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
        series: [
          chart.kind === "bar"
            ? {
                type: "bar",
                data: chart.values,
                barMaxWidth: 46,
                itemStyle: {
                  borderRadius: [8, 8, 0, 0],
                  color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: "#38bdf8" },
                    { offset: 1, color: "rgba(56,189,248,0.35)" },
                  ]),
                },
                label: { show: true, position: "top", color: text, fontSize: 11 },
              }
            : {
                type: "line",
                data: chart.values,
                smooth: 0.25,
                symbolSize: 8,
                lineStyle: { width: 3, color: accent },
                itemStyle: { color: accent, borderColor: dark ? "#18181b" : "#fff", borderWidth: 2 },
                label: { show: true, position: "top", color: text, fontSize: 11 },
                areaStyle: {
                  color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: "rgba(56,189,248,0.32)" },
                    { offset: 1, color: "rgba(56,189,248,0)" },
                  ]),
                },
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
    <figure className="bg-card/60 my-3 rounded-xl border p-3">
      <div ref={element} className="h-64 w-full" />
      <figcaption className="text-muted-foreground mt-1 text-right text-xs">
        数据来源：{chart.sources.map((n) => `[${n}]`).join("")}
      </figcaption>
    </figure>
  );
}
