import { describe, expect, it } from "vitest";

import { deriveVerdict } from "@/lib/answer-verdict";
import { extractSources } from "@/lib/chat-sources";
import { describeResearchStep, pagesOf, searchQueriesOf } from "@/lib/research-trace";
import type { AgentTraceEvent, ChatMessage } from "@/types";

const event = (step: string, detail: Record<string, unknown>, status = "COMPLETE"): AgentTraceEvent =>
  ({ step, round: 0, status, detail }) as AgentTraceEvent;

describe("research trace", () => {
  it("reads plain and structured search queries", () => {
    expect(searchQueriesOf({ queries: ["风力等级"] })).toEqual([{ query: "风力等级", hits: 0 }]);
    expect(searchQueriesOf({ queries: [{ query: "风速", hits: 4, failed: true }] })).toEqual([
      { query: "风速", hits: 4, failed: true },
    ]);
  });

  it("describes fetched pages with full-text counts", () => {
    const fetch = event("web_fetch", {
      pages: [
        { title: "A", domain: "a.cn", url: "https://a.cn", full_text: true },
        { title: "B", domain: "b.cn", url: "https://b.cn", full_text: false },
      ],
    });
    expect(pagesOf(fetch.detail)).toHaveLength(2);
    expect(describeResearchStep(fetch)).toBe("读取 2 个网页，其中 1 个读到全文");
    expect(describeResearchStep(event("retrieve", {}))).toBeUndefined();
  });

  it("counts each web search once even when P3 also logs a supplemental retrieval", () => {
    const trace = [
      event("web_search", { queries: [{ query: "q1", hits: 3 }] }),
      event("answer_verify", {}, "FAIL"),
      event("retrieve_missing", { query: "q2" }),
      event("web_search", { queries: [{ query: "q2", hits: 2 }] }, "COMPLETE"),
      event("answer_reverify", {}, "PASS"),
    ];
    const verdict = deriveVerdict(trace, "结论 [1][2]");
    expect(verdict?.searches).toBe(2);
    expect(verdict?.queries).toEqual(["q1", "q2"]);
  });
});

describe("web sources", () => {
  it("keeps the backend citation number and labels snippet-only pages", () => {
    const result = JSON.stringify({
      kind: "web_search",
      query: "q",
      results: [{ index: 3, title: "T", url: "https://www.x.cn/a", content: "c", published_at: "2024-01-01", snippet_only: true }],
    });
    const message = { toolCalls: [{ name: "search_web", result }] } as unknown as ChatMessage;
    const [source] = extractSources(message);
    expect(source?.index).toBe(3);
    expect(source?.subtitle).toBe("x.cn · 发布于 2024-01-01 · 仅搜索摘要");
  });
});
