import { extractSources } from "@/lib/chat-sources";
import { deriveVerdict } from "@/lib/answer-verdict";
import { finalClaims } from "@/lib/claims";
import type { ChatMessage } from "@/types";

const VERDICT_LABELS: Record<string, string> = {
  verified: "已核对",
  corrected: "纠错后通过",
  partial: "仅部分有依据",
  abstained: "没有找到答案",
  unchecked: "未完成核对",
};

/** A conversation as Markdown: each question and answer, how it was checked, and the sources it rests on. */
export function conversationToMarkdown(title: string, messages: ChatMessage[], exportedAt = new Date()): string {
  const lines: string[] = [`# ${title || "对话记录"}`, "", `导出时间：${exportedAt.toLocaleString("zh-CN")}`, ""];

  for (const message of messages) {
    if (message.role === "user") {
      lines.push(`## 问：${message.content.trim().replace(/\n+/g, " ")}`, "");
      continue;
    }
    if (message.role !== "assistant" || !message.content.trim()) continue;

    lines.push(message.content.trim(), "");
    const verdict = deriveVerdict(message.agentTrace, message.content);
    if (verdict) lines.push(`> 核对结论：${VERDICT_LABELS[verdict.kind] ?? verdict.kind}`, "");

    const claims = finalClaims(message.agentTrace);
    if (claims.length > 0) {
      lines.push("**逐条核对**", "");
      for (const claim of claims) {
        const cites = (claim.citation_indices ?? []).map((n) => `[${n}]`).join("");
        lines.push(`- ${claim.supported ? "✅" : "❌"} ${claim.claim}${cites ? ` ${cites}` : ""}`);
      }
      lines.push("");
    }

    const sources = extractSources(message);
    if (sources.length > 0) {
      lines.push("**依据来源**", "");
      for (const source of sources) {
        const where = source.subtitle ? `（${source.subtitle}）` : "";
        const quote = source.content ? `：${source.content.replace(/\s+/g, " ").slice(0, 120)}` : "";
        lines.push(`${source.index}. ${source.title}${where}${quote}`);
      }
      lines.push("");
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.replace(/[\\/:*?"<>|]/g, "_");
  link.click();
  URL.revokeObjectURL(url);
}
