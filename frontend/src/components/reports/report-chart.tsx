"use client";

import type { EChartsType } from "echarts";
import { useEffect, useRef } from "react";

import type { ReportSectionData } from "@/types/report";

type Chart = NonNullable<ReportSectionData["chart"]>;

/** Trend line of one indicator, built only from verbatim-checked data points. */
export function ReportChart({ chart }: { chart: Chart }) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let instance: EChartsType | undefined;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void import("echarts").then((echarts) => {
      if (!element.current || disposed) return;
      instance = echarts.init(element.current);
      instance.setOption({
        title: { text: chart.title, left: "center", textStyle: { fontSize: 13 } },
        tooltip: { trigger: "axis" },
        grid: { left: 48, right: 24, top: 40, bottom: 40 },
        xAxis: { type: "category", data: chart.labels },
        yAxis: { type: "value", name: chart.unit, scale: true },
        series: [
          {
            type: "line",
            data: chart.values,
            label: { show: true, position: "top" },
            smooth: false,
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
    <figure>
      <div ref={element} className="h-64 w-full" />
      <figcaption className="text-muted-foreground text-right text-xs">
        数据来源：{chart.sources.map((n) => `[${n}]`).join("")}
      </figcaption>
    </figure>
  );
}
