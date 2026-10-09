import { describe, expect, it } from "vitest";

import { conversationToMarkdown } from "./export-markdown";
import type { ChatMessage } from "@/types";

const msg = (partial: Partial<ChatMessage>): ChatMessage =>
  ({ id: "1", role: "user", content: "", timestamp: new Date(), ...partial }) as ChatMessage;

describe("conversationToMarkdown", () => {
  it("renders the question, answer and the claim check", () => {
    const md = conversationToMarkdown(
      "退款",
      [
        msg({ content: "退款要审批吗？" }),
        msg({
          id: "2",
          role: "assistant",
          content: "超过 500 美元需要审批 [1]。",
          agentTrace: [
            {
              step: "answer_verify",
              round: 1,
              status: "PASS",
              detail: { claims: [{ claim: "超过 500 美元需要审批", supported: true, citation_indices: [1] }] },
            },
          ],
        }),
      ],
      new Date("2026-10-09T00:00:00Z"),
    );
    expect(md).toContain("# 退款");
    expect(md).toContain("## 问：退款要审批吗？");
    expect(md).toContain("- ✅ 超过 500 美元需要审批 [1]");
  });

  it("skips empty assistant messages", () => {
    expect(conversationToMarkdown("x", [msg({ role: "assistant", content: "  " })])).not.toContain("核对");
  });
});
