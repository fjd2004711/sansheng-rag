"use client";

import type { ReportDiagram } from "@/types/report";

import { MermaidDiagram } from "./mermaid-diagram";

const BR = "<br/>";

/** Same Mermaid the server writes for the chat; built here from the stored spec so old reports stay valid. */
function mermaidOf(d: ReportDiagram): string {
  const clean = (t: string) =>
    t
      .replace(/["[\]{}()<>`#;|]/g, " ")
      .replace(/:/g, "：")
      .trim();
  if (d.kind === "timeline") {
    return [
      "timeline",
      `    title ${clean(d.title)}`,
      ...d.events.map((e) => `    ${clean(e.period)} : ${clean(e.label)}`),
    ].join("\n");
  }
  return [
    "flowchart LR",
    ...d.nodes.map((n) => `    ${n.id}["${clean(n.label).replace("｜", BR)}"]`),
    ...d.edges.map(([a, b]) => `    ${a} --> ${b}`),
    "    classDef good fill:#e7f6ec,stroke:#2f9e5b,color:#14532d",
    "    classDef warn fill:#fff4dc,stroke:#d4900a,color:#6b4500",
    "    classDef bad fill:#fde8e8,stroke:#d64545,color:#7a1f1f",
    ...d.nodes.filter((n) => n.tone !== "plain").map((n) => `    class ${n.id} ${n.tone}`),
  ].join("\n");
}

/** A vertical timeline: date on the left, the verified figure on the right. */
export function TimelineView({ events }: { events: { period: string; label: string }[] }) {
  return (
    <ol className="bg-card my-3 rounded-lg border px-4 py-3">
      {events.map((e, i) => (
        <li key={`${e.period}-${i}`} className="relative flex gap-4 pb-4 last:pb-0">
          <span className="text-muted-foreground w-28 shrink-0 text-right text-xs tabular-nums sm:w-36">
            {e.period}
          </span>
          <span className="relative flex flex-col items-center">
            <span className="bg-brand z-10 mt-1 h-2.5 w-2.5 rounded-full" />
            {i < events.length - 1 && (
              <span className="bg-border absolute top-3.5 -bottom-4 w-px" />
            )}
          </span>
          <span className="text-sm">{e.label}</span>
        </li>
      ))}
    </ol>
  );
}

/** The report's figures drawn from its own structure and verified data: evidence map, timeline. */
export function ReportDiagrams({ diagrams }: { diagrams?: ReportDiagram[] }) {
  if (!diagrams?.length) return null;
  return (
    <section className="space-y-4">
      <h3 className="text-lg font-semibold">图示</h3>
      {diagrams.map((d) => (
        <figure key={d.title}>
          <figcaption className="mb-1 text-sm font-medium">{d.title}</figcaption>
          {d.kind === "timeline" ? (
            <TimelineView events={d.events} />
          ) : (
            <MermaidDiagram code={mermaidOf(d)} />
          )}
          {d.caption && <p className="text-muted-foreground mt-1 text-xs">{d.caption}</p>}
        </figure>
      ))}
    </section>
  );
}
