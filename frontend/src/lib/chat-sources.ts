import { parseRAGResults } from "@/components/chat/tool-results/rag";
import { parseWebSearch } from "@/components/chat/tool-results/web-search";
import type { ChatMessage, ToolCall } from "@/types";

export interface SourceItem {
  index: number;
  type: "rag" | "web";
  title: string;
  subtitle?: string;
  url?: string;
  content?: string;
  score?: number;
  componentScores?: Record<string, number>;
}

function getToolCalls(message: ChatMessage): ToolCall[] {
  const fromParts = (message.parts ?? [])
    .filter((p) => p.type === "tool" && !!p.toolCall)
    .map((p) => p.toolCall!);
  if (fromParts.length > 0) return fromParts;
  return message.toolCalls ?? [];
}

export function extractSources(message: ChatMessage): SourceItem[] {
  const sources: SourceItem[] = [];

  for (const tc of getToolCalls(message)) {
    const result = typeof tc.result === "string" ? tc.result : "";
    if (!result) continue;

    if (tc.name === "search_knowledge_base" || tc.name === "search_documents") {
      for (const item of parseRAGResults(result)) {
        sources.push({
          index: item.index,
          type: "rag",
          title: item.source,
          subtitle:
            [
              item.page && `第 ${item.page} 页`,
              item.chunk && `第 ${Number(item.chunk) + 1} 段`,
              item.ocr && "扫描件识别文字",
            ]
              .filter(Boolean)
              .join(" · ") || undefined,
          content: item.content,
          score: item.score ? parseFloat(item.score) : undefined,
          componentScores: item.componentScores,
        });
      }
    } else if (tc.name === "web_search" || tc.name === "search_web") {
      const payload = parseWebSearch(result);
      if (payload?.results) {
        payload.results.forEach((hit, i) => {
          sources.push({
            index: hit.index ?? i + 1,
            type: "web",
            title: hit.title || domainOf(hit.url),
            subtitle: [
              domainOf(hit.url),
              hit.published_at && `发布于 ${hit.published_at}`,
              hit.snippet_only && "仅搜索摘要",
            ]
              .filter(Boolean)
              .join(" · "),
            url: hit.url,
            content: hit.content,
          });
        });
      }
    }
  }

  return sources;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
