import type { AgentTraceEvent } from "@/types";

/** Research-mode trace steps (web search instead of the knowledge base). */
export const RESEARCH_STEPS = new Set(["research_plan", "web_search", "web_fetch", "web_evidence"]);

export interface WebSearchQuery {
  query: string;
  hits: number;
  failed?: boolean;
}

export interface FetchedPage {
  title: string;
  domain: string;
  url: string;
  fullText: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

export function searchQueriesOf(detail: Record<string, unknown>): WebSearchQuery[] {
  const raw = detail.queries;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): WebSearchQuery[] => {
    if (typeof item === "string") return [{ query: item, hits: 0 }];
    if (isRecord(item) && typeof item.query === "string")
      return [{ query: item.query, hits: Number(item.hits) || 0, failed: item.failed === true }];
    return [];
  });
}

export function pagesOf(detail: Record<string, unknown>): FetchedPage[] {
  const raw = detail.pages;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).map((p) => ({
    title: String(p.title ?? ""),
    domain: String(p.domain ?? ""),
    url: String(p.url ?? ""),
    fullText: p.full_text === true,
  }));
}

/** One plain-Chinese sentence for a research step, or undefined when the step is not a research step. */
export function describeResearchStep(event: AgentTraceEvent): string | undefined {
  const d = event.detail;
  switch (event.step) {
    case "research_plan": {
      const queries = searchQueriesOf(d).map((q) => `「${q.query}」`);
      return queries.length ? `准备搜索 ${queries.join("、")}` : "准备搜索";
    }
    case "web_search": {
      const fresh = typeof d.new_pages === "number" ? d.new_pages : 0;
      if (event.status === "FAILED") return "搜索服务暂时不可用";
      return fresh ? `搜到 ${fresh} 个新网页` : "没有搜到新的网页";
    }
    case "web_fetch": {
      const pages = pagesOf(d);
      const full = pages.filter((p) => p.fullText).length;
      return `读取 ${pages.length} 个网页，其中 ${full} 个读到全文`;
    }
    case "web_evidence": {
      const domains = Array.isArray(d.domains) ? d.domains.length : 0;
      return `挑出 ${typeof d.count === "number" ? d.count : 0} 段证据，来自 ${domains} 个网站`;
    }
    default:
      return undefined;
  }
}
