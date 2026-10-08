/**
 * Human-readable captions narrating what the agent is doing "under the hood"
 * while a tool runs. Used by the live agent-step animation to label each step
 * in plain language. Dependency-free — safe to use anywhere in the UI.
 */

const EXACT_CAPTIONS: Record<string, string> = {
  search_knowledge_base: "正在检索知识库",
  search_documents: "正在检索资料",
  web_search_tool: "正在搜索网页",
  search_web: "正在搜索网页",
  fetch_url: "正在阅读网页",
  get_current_datetime: "正在查看日期时间",
  run_python: "正在计算",
  create_chart_tool: "正在生成图表",
  create_map_tool: "正在绘制地图",
  ask_user: "正在向你提问",
  load_capability: "正在加载技能",
};

/** Prefix-based fallbacks for tools like `generate_*`. */
const PREFIX_CAPTIONS: ReadonlyArray<readonly [string, string]> = [
  ["generate_", "正在生成图表"],
  ["search_", "正在检索"],
  ["create_", "正在生成"],
  ["fetch_", "正在获取数据"],
  ["get_", "正在查询"],
  ["list_", "正在查询"],
];

function humanizeToolName(name: string): string {
  const words = name
    .replace(/_tool$/, "")
    .split("_")
    .filter(Boolean);
  if (words.length === 0) return name;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

const DISPLAY_NAMES: Record<string, string> = {
  run_python: "运行计算",
  create_chart_tool: "图表",
  create_map_tool: "地图",
  web_search_tool: "网页搜索",
  search_web: "网页搜索",
  web_search: "网页搜索",
  web_fetch: "读取网页",
  fetch_url: "读取网页",
  get_current_datetime: "当前日期时间",
  search_knowledge_base: "知识库检索",
  search_documents: "知识库检索",
  ask_user: "提问",
  load_capability: "加载技能",
};

export function toolDisplayName(toolName: string): string {
  return DISPLAY_NAMES[toolName] ?? humanizeToolName(toolName);
}

/**
 * Present-tense phrase describing what the agent is doing while `toolName` runs.
 * Falls back to "Running <Tool Name>" for unknown tools.
 */
export function toolCaption(toolName: string): string {
  const exact = EXACT_CAPTIONS[toolName];
  if (exact) return exact;
  for (const [prefix, caption] of PREFIX_CAPTIONS) {
    if (toolName.startsWith(prefix)) return caption;
  }
  return `正在执行 ${humanizeToolName(toolName)}`;
}
