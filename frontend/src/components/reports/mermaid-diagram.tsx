"use client";

import { useEffect, useId, useState } from "react";

function isDark(): boolean {
  const root = document.documentElement;
  if (root.classList.contains("dark")) return true;
  if (root.classList.contains("light")) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** A Mermaid diagram drawn in the browser. Shows the source as plain text if it cannot be drawn. */
export function MermaidDiagram({ code }: { code: string }) {
  const id = `mmd-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    void import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: isDark() ? "dark" : "neutral",
          fontFamily: "inherit",
          flowchart: { htmlLabels: false, curve: "basis" },
        });
        const { svg: drawn } = await mermaid.render(id, code);
        if (!cancelled) setSvg(drawn);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [code, id]);

  if (failed) {
    return (
      <pre className="bg-muted overflow-x-auto rounded-lg border p-3 text-xs whitespace-pre-wrap">{code}</pre>
    );
  }
  if (!svg) return <div className="bg-muted/50 h-40 animate-pulse rounded-lg border" aria-label="图示加载中" />;
  return (
    <div
      className="bg-card my-3 overflow-x-auto rounded-lg border p-3 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
      role="img"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
