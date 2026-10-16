import type { AgentTraceEvent } from "@/types";

/** Plain-Chinese names for the structured trace steps, shared by the flow panel and the live status line. */
export const TRACE_STEP_LABELS: Record<string, string> = {
  question_condense: "补全问题",
  content_guard: "发现资料里夹带指令",
  retrieve: "检索资料",
  evidence_evaluate: "判断资料够不够用",
  failure_diagnose: "分析为什么没找到",
  query_rewrite: "换个问法",
  answer_verify: "核对回答",
  answer_diagnose: "分析回答的不足",
  retrieve_missing: "补充检索",
  regenerate: "依据资料重新作答",
  answer_reverify: "再次核对回答",
  partial_answer: "先给出能确认的部分",
  abstain: "如实告知查不到",
  max_rounds_reached: "已达纠错次数上限",
  research_plan: "规划搜索词",
  web_search: "网页搜索",
  web_fetch: "读取网页",
  web_evidence: "挑选证据",
  claim_audit: "逐条交叉核验",
  corroborate: "为存疑说法补找来源",
};

export const TRACE_STATUS_LABELS: Record<string, string> = {
  PASS: "通过",
  COMPLETE: "完成",
  FAIL: "未通过",
  REWRITE: "改写后重试",
  EXPAND: "扩大范围重试",
  RETRIEVE: "补充检索",
  ABSTAIN: "拒答",
  STOP: "已停止",
  EMPTY: "无结果",
  FAILED: "失败",
};

export const TRACE_FAILURE_LABELS: Record<string, string> = {
  insufficient_evidence: "资料不足",
  ambiguous_query: "问题含糊",
  out_of_scope: "资料库里没有相关内容",
  irrelevant_evidence: "找到的资料不相关",
  hallucination: "回答里有缺乏依据的说法",
  incomplete: "回答不完整",
};

/** What the system is doing *next*, given the latest trace event — shown while the answer is not out yet. */
export function progressText(last: AgentTraceEvent | undefined): string {
  if (!last) return "正在检索资料…";
  switch (last.step) {
    case "question_condense":
      return "正在检索资料…";
    case "research_plan":
      return "正在网上搜索…";
    case "web_search":
      return "正在读取网页…";
    case "web_fetch":
      return "正在从网页中挑选证据…";
    case "web_evidence":
      return "正在依据网页资料撰写并核对回答…";
    case "claim_audit":
      return last.status === "PASS" ? "每条说法都已核实，正在输出…" : "正在为存疑的说法补找来源…";
    case "corroborate":
      return "正在重新核验…";
    case "retrieve":
      return "正在判断找到的资料够不够用…";
    case "evidence_evaluate":
      return last.status === "PASS" ? "资料足够，正在撰写并核对回答…" : "资料不够用，正在分析原因…";
    case "failure_diagnose":
      return last.status === "ABSTAIN" ? "正在整理回答…" : "正在换个问法重新检索…";
    case "query_rewrite":
      return "正在用新问法重新检索…";
    case "max_rounds_reached":
      return "已达检索次数上限，正在核对回答…";
    case "answer_verify":
      return last.status === "PASS" ? "回答核对通过，正在输出…" : "核对发现问题，正在纠正…";
    case "answer_diagnose":
      return "正在补充检索缺少的内容…";
    case "retrieve_missing":
      return "正在依据新找到的资料重写回答…";
    case "regenerate":
      return "正在再次核对修改后的回答…";
    case "answer_reverify":
    case "partial_answer":
    case "abstain":
      return "正在输出回答…";
    default:
      return "正在处理…";
  }
}

export const TRACE_ACTION_LABELS: Record<string, string> = {
  rewrite: "换个问法，重新检索",
  expand: "扩大范围，重新检索",
  abstain: "不再检索，如实告知查不到",
  stop: "停止检索",
};

/** Names for the per-stage retrieval scores recorded with each retrieved chunk. */
export const RETRIEVAL_SCORE_LABELS: Record<string, string> = {
  dense_score: "语义相似",
  bm25_score: "关键词匹配",
  rrf_score: "综合排名",
  reranker_score: "精排得分",
};

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

/** "资料不足：……" — the failure type and the reason the judge gave, in one readable line. */
export function describeFailure(detail: Record<string, unknown>): string | undefined {
  const type = text(detail.failure_type);
  const reason = text(detail.failure_reason) ?? text(detail.reason);
  const label = type ? (TRACE_FAILURE_LABELS[type] ?? type) : undefined;
  if (label && reason) return `${label}：${reason}`;
  return reason ?? label;
}
