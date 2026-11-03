// 三省 初赛方案讲解 PPT：以线装古籍为式样——靛蓝书衣与题签、宣纸内页、四周双边版框、版心鱼尾与汉字页码，
// 宋体正文、楷体批注，朱色只用于圈点与按语；学术体例：卷次、图表编号、三线表、算法框、参考文献。
// 数字均来自仓库内的实测产物（artifacts/ 与方案书），截图来自本地真实运行。
// 用法：python docs/proposal/make_deck_assets.py && NODE_PATH=<含 pptxgenjs 的 node_modules> node docs/proposal/make_deck.js
const path = require("path");
const pptxgen = require("pptxgenjs");

const A = (f) => path.join(__dirname, "deck_assets", f);
const OUT = process.env.DECK_OUT || path.join(__dirname, "三省-方案讲解.pptx");
const SONG = "Songti SC", KAI = "Kaiti SC";
const INK = "231F1A", VERM = "A83A2C", STONE = "2F5D73", PINE = "3E6B50", OCHRE = "9A6B1F";
const BROWN = "6B6257", RULE = "A39886", DEEP = "E7DFCD", SLIP = "F2ECDF", LIGHT = "E8E2D2";
const TOTAL = 15;

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10 x 5.625 in
pres.title = "三省：可验证的多智能体编排调度平台";
pres.author = "三省项目组";

const CN = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二", "十三", "十四", "十五"];
let n = 0, figNo = 0, tabNo = 0;
const T = (s, text, o) => s.addText(text, { fontFace: SONG, color: INK, margin: 0, isTextBox: true, ...o });
const vert = (s, str, o) => T(s, [...str].join("\n"), { align: "center", valign: "top", lineSpacingMultiple: 1.0, ...o });
const line = (s, x1, y1, x2, y2, o = {}) =>
  s.addShape(pres.shapes.LINE, { x: x1, y: y1, w: x2 - x1, h: y2 - y1, line: { color: INK, width: 0.75, ...o } });
const rect = (s, x, y, w, h, o = {}) =>
  s.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: o.fill ? { color: o.fill } : { type: "none" }, line: { color: o.color || INK, width: o.width ?? 0.75, dashType: o.dash || "solid" } });
const arrow = (s, x1, y1, x2, y2, color = BROWN) =>
  s.addShape(pres.shapes.LINE, {
    x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
    flipH: x2 < x1, flipV: y2 < y1, line: { color, width: 1, endArrowType: "triangle" },
  });
// "文字{朱色强调}文字"
const runs = (str, base = {}) =>
  str.split(/(\{[^}]*\})/).filter(Boolean).map((p) =>
    p.startsWith("{") ? { text: p.slice(1, -1), options: { ...base, color: VERM, bold: true } } : { text: p, options: base });

// 内页：宣纸、四周双边、右侧版心（鱼尾、书名、卷名、页码）
function page(juan, title, note) {
  const s = pres.addSlide();
  n += 1;
  s.background = { path: A("paper.png") };
  rect(s, 0.22, 0.22, 9.56, 5.185, { width: 2.25 });
  rect(s, 0.3, 0.3, 9.4, 5.025, { width: 0.6 });
  line(s, 9.05, 0.3, 9.05, 5.325, { width: 0.6 });
  s.addImage({ path: A("fishtail.png"), x: 9.195, y: 0.48, w: 0.36, h: 0.225 });
  vert(s, "三省", { x: 9.2, y: 0.82, w: 0.35, h: 0.62, fontSize: 13, bold: true });
  if (juan) vert(s, juan.replace(/\s/g, ""), { x: 9.24, y: 1.58, w: 0.27, h: 1.9, fontSize: 10, color: BROWN });
  vert(s, CN[n], { x: 9.24, y: 4.55, w: 0.27, h: 0.62, fontSize: 11, color: BROWN });
  if (juan) T(s, juan, { x: 0.6, y: 0.44, w: 4, h: 0.28, fontFace: KAI, fontSize: 12, color: VERM, valign: "middle" });
  if (title) T(s, title, { x: 0.6, y: 0.72, w: 8.25, h: 0.5, fontSize: 21, bold: true, valign: "middle" });
  if (note) T(s, [{ text: "按　", options: { fontFace: KAI, color: VERM, bold: true } }, ...runs(note, { fontFace: KAI })],
    { x: 0.6, y: 4.74, w: 8.25, h: 0.36, fontSize: 13, valign: "middle" });
  return s;
}
const figure = (s, file, x, y, w, ratio, caption) => {
  const h = w / ratio;
  rect(s, x - 0.04, y - 0.04, w + 0.08, h + 0.08, { color: RULE, width: 0.75 });
  s.addImage({ path: A(`fig/${file}.png`), x, y, w, h });
  figNo += 1;
  T(s, `图${CN[figNo]}　${caption}`, { x: x - 0.4, y: y + h + 0.06, w: w + 0.8, h: 0.24, fontFace: KAI, fontSize: 11, color: BROWN, align: "center", valign: "middle" });
  return y + h;
};
// 三线表：表题在上，顶线与底线粗、栏目线细，无竖线
function table(s, caption, rows, x, y, colW, o = {}) {
  tabNo += 1;
  const w = colW.reduce((a, b) => a + b, 0);
  T(s, `表${CN[tabNo]}　${caption}`, { x, y, w, h: 0.26, fontFace: KAI, fontSize: 11, color: BROWN, align: "center", valign: "middle" });
  const none = { type: "none" };
  const thick = { type: "solid", pt: 1.5, color: INK }, thin = { type: "solid", pt: 0.6, color: INK };
  const data = rows.map((row, r) => row.map((cell, c) => {
    const base = typeof cell === "string" ? { text: cell } : cell;
    const top = r === 0 ? thick : none;
    const bottom = r === 0 ? thin : r === rows.length - 1 ? thick : none;
    return {
      text: base.text,
      options: {
        fontFace: SONG, fontSize: o.size || 11.5, color: base.color || INK, bold: r === 0 || base.bold,
        align: c === 0 || o.left?.includes(c) ? "left" : "center", valign: "middle", border: [top, none, bottom, none],
        margin: [0, 0.06, 0, 0.06],
      },
    };
  }));
  s.addTable(data, { x, y: y + 0.3, w, colW, rowH: o.rowH || 0.38 });
}
const ring = (s, x, y, d, label, color = VERM) => {
  s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { type: "none" }, line: { color, width: 1 } });
  T(s, label, { x, y, w: d, h: d, fontSize: 13, bold: true, color, align: "center", valign: "middle" });
};
const node = (s, x, y, w, h, text, color, size = 13) => {
  rect(s, x, y, w, h, { fill: DEEP, color, width: 1.25 });
  T(s, text, { x, y, w, h, fontSize: size, bold: true, color, align: "center", valign: "middle" });
};

// 一　封面（书衣与题签）
{
  const s = pres.addSlide();
  n += 1;
  s.background = { path: A("cover.png") };
  rect(s, 1.25, 0.5, 1.55, 4.0, { fill: SLIP, width: 1 });
  rect(s, 1.32, 0.57, 1.41, 3.86, { width: 0.5 });
  vert(s, "三省", { x: 1.98, y: 0.78, w: 0.7, h: 1.65, fontSize: 46, bold: true });
  vert(s, "可验证的多智能体编排调度平台", { x: 1.47, y: 0.9, w: 0.36, h: 3.4, fontSize: 12, lineSpacingMultiple: 0.98 });
  s.addImage({ path: A("seal.png"), x: 2.04, y: 3.68, w: 0.56, h: 0.56 });
  T(s, "取唐代三省制之意：中书起草，门下审核，尚书执行", { x: 4.2, y: 4.25, w: 5.3, h: 0.34, fontFace: KAI, fontSize: 14, color: LIGHT, align: "right", valign: "middle" });
  T(s, "写的人不审，审的人不写", { x: 4.2, y: 4.6, w: 5.3, h: 0.3, fontFace: KAI, fontSize: 12, color: "C9C3B3", align: "right", valign: "middle" });
  T(s, "大模型 Agent 工具编排调度平台赛题 · 初赛方案讲解", { x: 4.2, y: 4.95, w: 5.3, h: 0.26, fontSize: 10.5, color: "A9A495", align: "right", valign: "middle" });
  s.addNotes("各位评委好。我们的系统叫三省，名字取自唐代的三省制：中书省起草，门下省审核，觉得不妥可以封驳退回，尚书省执行。写的人不审，审的人不写，这是我们整个平台的设计主线。下面用十几分钟，讲清楚我们做了什么、怎么做、效果如何。");
}

// 二　卷目（竖排，自右向左）
{
  const s = page(null, null, null);
  vert(s, "汇报卷目", { x: 8.15, y: 0.6, w: 0.55, h: 2.2, fontSize: 22, bold: true });
  line(s, 7.95, 0.5, 7.95, 5.1, { color: RULE, width: 0.5 });
  const items = [
    ["卷一", "研究背景", "谁来判定完成"],
    ["卷二", "总体设计", "三省分权与技术路线"],
    ["卷三", "关键技术", "编排调度核查自循环"],
    ["卷四", "实现与实验", "真实界面与实测数据"],
    ["卷五", "创新与展望", "创新不足与下一步"],
  ];
  items.forEach(([juan, title, desc], i) => {
    const x = 6.45 - i * 1.5;
    T(s, juan, { x, y: 0.6, w: 1.5, h: 0.3, fontFace: KAI, fontSize: 13, color: VERM, align: "center", valign: "middle" });
    vert(s, title, { x: x + 0.78, y: 1.05, w: 0.48, h: 2.2, fontSize: 20, bold: true });
    vert(s, desc, { x: x + 0.3, y: 1.3, w: 0.32, h: 2.4, fontFace: KAI, fontSize: 12, color: BROWN });
    if (i < 4) line(s, x, 0.5, x, 5.1, { color: RULE, width: 0.5 });
  });
  s.addNotes("汇报分五卷：研究背景、总体设计、关键技术、实现与实验、创新与展望。");
}

// 三　卷一 研究背景
{
  const s = page("卷一　研究背景", "多智能体流水线里，“完成”由谁来判定", "研究问题——如何在{可控的时间与成本}内，交付{经独立核验}的结果");
  [
    ["自评偏差", "模型倾向于给自己的输出打高分，仅靠自我纠错难以发现错误〔1,2〕。"],
    ["串行低效", "检索、阅读、核查环环相扣，一份调研报告动辄十几分钟以上。"],
    ["失败失控", "出错后要么整体中断，要么带错继续；无界重试越改越差，成本失控。"],
  ].forEach(([head, body], i) => {
    const y = 1.45 + i * 0.95;
    ring(s, 0.6, y, 0.42, CN[i + 1]);
    T(s, head, { x: 1.2, y: y - 0.02, w: 3.9, h: 0.32, fontSize: 15, bold: true, valign: "middle" });
    T(s, body, { x: 1.2, y: y + 0.33, w: 3.9, h: 0.5, fontSize: 12.5, color: INK, valign: "top" });
  });
  const steps = ["规划员", "检索员", "撰稿员", "交付成果"];
  steps.forEach((t, i) => {
    const y = 1.45 + i * 0.68;
    node(s, 5.95, y, 1.7, 0.42, t, i === 3 ? VERM : INK, 12.5);
    T(s, i === 3 ? "无人核查" : "自报通过", { x: 7.78, y, w: 1.0, h: 0.42, fontFace: KAI, fontSize: 12, color: i === 3 ? VERM : BROWN, valign: "middle" });
    if (i < 3) arrow(s, 6.8, y + 0.42, 6.8, y + 0.68);
  });
  T(s, `图${CN[++figNo]}　传统流水线：各环节自报通过`, { x: 5.4, y: 4.12, w: 3.4, h: 0.24, fontFace: KAI, fontSize: 11, color: BROWN, align: "center", valign: "middle" });
  T(s, "〔1〕Huang J, et al. Large Language Models Cannot Self-Correct Reasoning Yet. ICLR, 2024.　〔2〕Panickssery A, et al. LLM Evaluators Recognize and Favor Their Own Generations. NeurIPS, 2024.",
    { x: 0.6, y: 4.44, w: 8.25, h: 0.28, fontSize: 8, color: BROWN, valign: "middle" });
  s.addNotes("先说问题。让一组大模型分工协作已经很常见，但最让人不踏实的是最后那句“完成”可不可信。第一，模型倾向于给自己的输出打高分，已有研究表明仅靠自我纠错难以发现推理错误。第二，检索、阅读、核查串行，一份报告动辄十几分钟。第三，出错后要么整体中断，要么带错继续，无界重试还会越改越差。右图就是传统流水线：每一环都自报通过，最后交付的东西没有人真正检查过。所以我们的研究问题是：如何在可控的时间与成本内，交付经独立核验的结果。");
}

// 四　卷二 三省分权
{
  const s = page("卷二　总体设计", "借三省制分权：起草、审核、执行各司其职", "核查员{看不到起草者的推理}，只凭证据判断；不达标即“封驳”退回重做");
  figure(s, "about", 0.65, 1.42, 3.4, 777 / 612, "系统内“三省的由来”说明（真实界面）");
  table(s, "三省与系统角色对应", [
    ["三省", "职掌", "系统角色"],
    [{ text: "中书省", color: STONE, bold: true }, "起草", "规划师、撰稿人、分析师"],
    [{ text: "门下省", color: VERM, bold: true }, "审核 · 封驳", "独立核查员、质量门"],
    [{ text: "尚书省", color: PINE, bold: true }, "执行", "调度器、检索员、修复员、主编"],
  ], 4.4, 1.4, [0.85, 1.0, 2.6], { rowH: 0.5, size: 12 });
  T(s, "这是帮助理解分工的类比，而非对古代制度的复刻：门下省封驳整份诏令，核查员逐条说法地审。",
    { x: 4.4, y: 3.85, w: 4.45, h: 0.55, fontFace: KAI, fontSize: 11.5, color: BROWN, valign: "top" });
  s.addNotes("我们借用三省制来分权。中书省起草，对应规划师、撰稿人和分析师，只管写不管批；门下省审核，觉得不妥可以封驳退回，对应独立核查员和质量门；尚书省执行，对应调度器、检索员、修复员和主编。左图是系统里真实的说明界面，用户点名字旁的图标就能看到。需要说明这是一个类比：门下省封驳的是整份诏令，我们的核查员是逐条说法地审。");
}

// 五　卷二 总体架构
{
  const s = page("卷二　总体设计", "系统总体架构：一套编排引擎，支撑两个应用", "两个应用共用一套编排引擎，运行全程{可在编排页回放}");
  const layers = [
    ["应用层", [["问答 · LangGraph", "检索纠错、生成纠错、有界循环"], ["调研报告 · 编排流水线", "规划、检索、阅读、核查、统稿"]], STONE],
    ["编排层", [["声明式定义（YAML）", "知识库、Agent、团队、工作流、策略，导入时校验"]], VERM],
    ["调度层", [["asyncio 自研调度器", "就绪集、优先级、资源池、重试、超时、预算、模型降级、运行时插入任务"]], PINE],
    ["基础设施", [["FastAPI", ""], ["PostgreSQL", ""], ["Qdrant", ""], ["Next.js 15", ""]], BROWN],
  ];
  layers.forEach(([name, parts, c], i) => {
    const y = 1.42 + i * 0.7;
    rect(s, 0.6, y, 1.1, 0.54, { fill: DEEP, color: INK });
    T(s, name, { x: 0.6, y, w: 1.1, h: 0.54, fontSize: 13, bold: true, align: "center", valign: "middle" });
    const w = (6.95 - (parts.length - 1) * 0.15) / parts.length;
    parts.forEach(([a, b], j) => {
      const x = 1.9 + j * (w + 0.15);
      rect(s, x, y, w, 0.54, { color: c, width: 1.1 });
      T(s, a, { x, y: y + (b ? 0.04 : 0), w, h: b ? 0.26 : 0.54, fontSize: 12.5, bold: true, color: c, align: "center", valign: "middle" });
      if (b) T(s, b, { x, y: y + 0.29, w, h: 0.22, fontSize: 10.5, color: BROWN, align: "center", valign: "middle" });
    });
    if (i < 3) arrow(s, 5.37, y + 0.54, 5.37, y + 0.7);
  });
  T(s, `图${CN[++figNo]}　系统分层架构`, { x: 0.6, y: 4.3, w: 8.25, h: 0.24, fontFace: KAI, fontSize: 11, color: BROWN, align: "center", valign: "middle" });
  s.addNotes("架构分四层。应用层有两个应用：问答用 LangGraph 做有界纠错，调研报告走编排流水线。编排层是声明式定义，用 YAML 描述知识库、Agent、团队、工作流和策略，导入时就做校验。调度层是我们自己写的 asyncio 调度器，负责就绪集、资源池、重试、超时、预算和模型降级，还能在运行时插入任务。最下面是基础设施。");
}

// 六　卷二 技术路线
{
  const s = page("卷二　总体设计", "技术路线：起草—审核—修复—统稿的有界流程", "质量门未达标才进入修复，{修复结果不劣于原稿才采纳}");
  const nodes = [["规划", STONE], ["检索", PINE], ["阅读撰写", STONE], ["逐项核查", VERM], ["质量门", VERM], ["统稿披露", PINE]];
  const w = 1.15, gap = 0.27;
  nodes.forEach(([t, c], i) => {
    const x = 0.6 + i * (w + gap);
    node(s, x, 1.45, w, 0.52, t, c, 13);
    if (i < 5) arrow(s, x + w, 1.71, x + w + gap, 1.71);
  });
  const gx = 0.6 + 4 * (w + gap) + w / 2, mx = 0.6 + 5 * (w + gap) + w / 2;
  rect(s, 0.6, 2.5, 8.25, 1.25, { color: RULE, dash: "dash", width: 0.75 });
  T(s, "有界自循环", { x: 0.75, y: 2.56, w: 3, h: 0.28, fontFace: KAI, fontSize: 12, color: VERM, valign: "middle" });
  [["诊断失败类型", VERM], ["按类型修复", STONE], ["独立复核", VERM], ["不劣才采纳", PINE]].forEach(([t, c], i) => {
    const x = 0.95 + i * 1.95;
    node(s, x, 3.02, 1.55, 0.48, t, c, 12.5);
    if (i < 3) arrow(s, x + 1.55, 3.26, x + 1.95, 3.26);
  });
  arrow(s, gx, 1.97, gx, 2.5, VERM);
  arrow(s, mx, 2.5, mx, 1.97, PINE);
  T(s, "未达标", { x: gx - 0.95, y: 2.1, w: 0.85, h: 0.26, fontFace: KAI, fontSize: 11, color: VERM, align: "right", valign: "middle" });
  T(s, "达标", { x: mx + 0.08, y: 2.1, w: 0.6, h: 0.26, fontFace: KAI, fontSize: 11, color: PINE, valign: "middle" });
  [["中书 · 起草", STONE], ["门下 · 审核", VERM], ["尚书 · 执行", PINE]].forEach(([t, c], i) => {
    const x = 2.3 + i * 1.9;
    rect(s, x, 3.95, 0.16, 0.16, { fill: c, color: c });
    T(s, t, { x: x + 0.25, y: 3.89, w: 1.5, h: 0.28, fontFace: KAI, fontSize: 11.5, color: BROWN, valign: "middle" });
  });
  T(s, `图${CN[++figNo]}　报告生成的技术路线`, { x: 0.6, y: 4.3, w: 8.25, h: 0.24, fontFace: KAI, fontSize: 11, color: BROWN, align: "center", valign: "middle" });
  s.addNotes("这是一次报告运行的技术路线。石青色是中书省的起草环节，朱色是门下省的核查与质量门，松绿是尚书省的执行与统稿。质量门达标就进入统稿，并把不确定之处如实披露；未达标则进入下方的有界自循环：先诊断失败类型，再按类型修复，独立复核后只有不劣于原稿才采纳。");
}

// 七　卷三 声明式编排
{
  const s = page("卷三　关键技术", "关键技术一：声明式编排——流程是可校验的数据", "导入即校验：{依赖成环、引用缺失、模型名非法}，一律在运行前拒绝");
  figure(s, "spec-yaml", 0.65, 1.42, 4.05, 1799 / 1264, "工作流定义的画布与 YAML 视图（真实界面）");
  table(s, "五类声明对象", [
    ["对象", "声明内容"],
    ["知识库", "检索来源、优先站点、检索策略"],
    ["Agent", "角色、技能、模型档位与工具"],
    ["团队", "成员与主管"],
    ["工作流", "节点、依赖、按数据扇出、质量门"],
    ["策略", "并发、预算、修复轮次、模型"],
  ], 5.15, 1.4, [1.0, 2.7], { rowH: 0.42, left: [1] });
  s.addNotes("关键技术一是声明式编排。流程在我们这里是数据而不是代码：知识库、Agent、团队、工作流、策略五类对象都用 YAML 声明，画布和 YAML 是同一份定义的两种视图。导入时就做校验，依赖成环、引用缺失、模型名非法，一律在运行前拒绝。每个 Agent 还可以单独指定模型。");
}

// 八　卷三 动态调度与流水线
{
  const s = page("卷三　关键技术", "关键技术二：动态调度与逐项流水线并行", "新能源题 {545 秒}内完成 27 个任务、430 次模型调用，并行加速比 {3.48}");
  figure(s, "live", 0.65, 1.42, 4.05, 1799 / 1264, "就业题运行中：画布与调度时间线实时更新");
  const base = 3.05;
  line(s, 5.35, base, 8.7, base, { width: 0.75 });
  [["就业", 3.29], ["收入", 2.95], ["新能源", 3.48]].forEach(([k, v], i) => {
    const x = 5.65 + i * 1.08, h = v * 0.42;
    const c = i === 2 ? VERM : STONE;
    rect(s, x, base - h, 0.62, h, { fill: c, color: c, width: 0.5 });
    T(s, v.toFixed(2), { x: x - 0.2, y: base - h - 0.28, w: 1.02, h: 0.26, fontSize: 12, bold: true, color: c, align: "center", valign: "middle" });
    T(s, k, { x: x - 0.2, y: base + 0.05, w: 1.02, h: 0.24, fontSize: 11.5, align: "center", valign: "middle" });
  });
  T(s, `图${CN[++figNo]}　三次真实运行的并行加速比（倍）`, { x: 5.0, y: 3.38, w: 4.05, h: 0.24, fontFace: KAI, fontSize: 11, color: BROWN, align: "center", valign: "middle" });
  T(s, [
    { text: "资源池分别限流：检索 3 路、模型 6 路；", options: { bullet: { code: "25CB" }, breakLine: true } },
    { text: "下游逐项只等上游对应项，上游失败则对应项明确标为失败。", options: { bullet: { code: "25CB" } } },
  ], { x: 5.25, y: 3.72, w: 3.6, h: 0.85, fontSize: 11.5, valign: "top", paraSpaceAfter: 4 });
  s.addNotes("关键技术二是动态调度。依赖满足就启动，检索和模型调用各有资源池，失败重试、超时终止，预算分软硬两道线，模型额度耗尽时自动换备用模型。这一轮我们做了逐项流水线：每读完一条就核查一条，下游每一项只等它对应的上游那一项。左图是就业题运行中的真实画面，核查节点正在逐项并行，画布和时间线实时更新；右图是三次真实运行的并行加速比，分别是三点二九、二点九五和三点四八倍。");
}

// 九　卷三 独立核查
{
  const s = page("卷三　关键技术", "关键技术三：独立核查——核查员看不到起草者的推理", "合成集误放行 {0/46}，真实网页误放行 {0/15}（改进前为 3/17）");
  table(s, "说法的四级判定", [
    ["等级", "判定依据"],
    [{ text: "已核实", color: PINE, bold: true }, "权威来源原文支持，或两个以上独立来源一致"],
    [{ text: "单一来源", color: STONE, bold: true }, "仅一个独立来源（转载计为同一来源）"],
    [{ text: "有争议", color: OCHRE, bold: true }, "有来源支持，另有可信来源说法不同"],
    [{ text: "未能核实", color: BROWN, bold: true }, "没有资料明确支持"],
  ], 0.6, 1.4, [1.1, 4.0], { rowH: 0.42, left: [1] });
  T(s, [{ text: "另有两条硬规则：", options: { bold: true } }, { text: "说法被驳回两次才判为不成立；数据点须在来源原文中逐字找到。" }],
    { x: 0.6, y: 3.95, w: 5.1, h: 0.55, fontSize: 12, valign: "top" });
  figure(s, "inspector", 6.35, 1.42, 2.25, 520 / 650, "核查员节点");
  s.addNotes("关键技术三是独立核查，也就是门下省。核查员能看到的内容里不包含起草者的推理，它自己重新取证，右图是核查员节点的真实配置。每条说法分四级：权威来源原文支持或两个以上独立来源一致才算已核实；只有一个独立来源算单一来源；有可信来源说法不同算有争议；找不到支持算未能核实。另有两条硬规则：被驳回两次才判为不成立；数据点必须能在原文里逐字找到。");
}

// 十　卷三 有界自循环
{
  const s = page("卷三　关键技术", "关键技术四：有界自循环——只在确实变好时才采纳", "新能源题五次改写中{四次被驳回、一次被采纳}；门槛为已核实说法占比不低于 50%");
  const code = [
    "输入：草稿 D，最大轮次 R，预算 B",
    "1　s ← 质量门(D)",
    "2　for r ← 1 … R do",
    "3　　if s 达标 或 已用预算 ≥ 0.6B then break",
    "4　　F ← 诊断失败类型(D)",
    "5　　E ← 按类型修复(D, F)　▷ 只改失败章节",
    "6　　t ← 独立复核(E)",
    "7　　if t 不劣于 s then D, s ← E, t",
    "8　　else if 无进展 then break",
    "9　return D, s",
  ];
  line(s, 0.6, 1.42, 5.0, 1.42, { width: 1.5 });
  T(s, "算法一　有界自循环（在质量门内执行）", { x: 0.6, y: 1.45, w: 4.4, h: 0.3, fontSize: 12, bold: true, valign: "middle" });
  line(s, 0.6, 1.78, 5.0, 1.78, { width: 0.6 });
  T(s, code.map((t, i) => ({ text: t, options: { breakLine: i < code.length - 1 } })), { x: 0.65, y: 1.86, w: 4.35, h: 2.5, fontSize: 11.5, valign: "top", lineSpacingMultiple: 1.08 });
  line(s, 0.6, 4.45, 5.0, 4.45, { width: 1.5 });
  figure(s, "gate", 5.3, 1.42, 3.5, 1799 / 486, "新能源题质量门：首次 34%，修复后 51%");
  table(s, "三次真实运行的自循环", [
    ["题目", "首轮已核实", "修复轮次", "终稿已核实"],
    ["就业", "95%", "0", "95%"],
    ["收入", "72%", "0", "72%"],
    ["新能源", "34%", "1", { text: "51%", color: VERM, bold: true }],
  ], 5.3, 2.75, [0.9, 0.9, 0.8, 0.9], { rowH: 0.34 });
  s.addNotes("关键技术四是有界自循环。算法一给出了流程：质量门不达标，先诊断失败类型，再只修复失败的章节，然后独立复核；只有结果不劣于原稿才采纳。停止条件有三个：达标、预算用到六成、没有进展，再加最大轮次。真实运行里，就业和收入两题首轮就达标，没有多花一次修复；新能源题首轮只有百分之三十四，修复一轮后到百分之五十一，五次改写里四次被驳回、一次被采纳。");
}

// 十一　卷四 资料问答
{
  const s = page("卷四　实现与实验", "系统实现（一）：资料问答——结论可追溯到证据与来源", "完整方案在 13 个场景上召回@5 为 {1.0}，仅纠错的基线为 0.8");
  figure(s, "chat-answer", 0.65, 1.42, 4.6, 1.6, "回答附引用，逐条核对说法（真实界面）");
  figure(s, "chat-trace", 5.95, 1.42, 2.15, 1010 / 1350, "详细运作过程");
  s.addNotes("下面看实现。问答模块用 LangGraph 管理状态与条件路由，检索是稠密向量加关键词再融合重排。左图是一次真实问答：跨两份文档的问题，回答里每个结论都带引用，并逐条核对说法；右图是展开的运作过程，检索了什么、判断资料够不够、核对回答，每一步都可见。离线评测里，完整方案在十三个场景上召回为一，仅纠错的基线为零点八。");
}

// 十二　卷四 调研报告
{
  const s = page("卷四　实现与实验", "系统实现（二）：调研报告——逐条分级，图表由数据生成", "每章标注已核实说法数；图表随正文{导出 PDF 与 Word}");
  figure(s, "report-top", 0.65, 1.42, 4.1, 1799 / 1264, "报告首页：核实分级与核心结论");
  figure(s, "report-diagrams", 5.4, 1.42, 2.6, 1080 / 1190, "报告结构与证据核实图");
  s.addNotes("调研报告跑的是同一套编排引擎。左图是新能源报告的首页，顶部是这次运行的耗时、任务数、并行度和核实比例，标题下是已核实、单一来源、有争议的数量。右图是由数据自动生成的报告结构与证据核实图，每一章标出已核实的说法数。报告可以导出 PDF 和 Word，图随正文一起走。");
}

// 十三　卷四 实验结果
{
  const s = page("卷四　实现与实验", "实验结果：核查零误放行，三次真实运行加速 2.95–3.48 倍", "后端测试 487 项通过（4 项跳过），端到端界面用例 18 个；样本量有限，置信区间见方案书");
  table(s, "核查评测", [
    ["数据集", "样本", "等级准确率", "误放行", "抽取召回"],
    ["合成集", "48 例 / 100 条说法", "97.7%", { text: "0 / 46", color: VERM, bold: true }, "88%"],
    ["真实网页", "28 例 / 60 条说法", "100%（n=46）", { text: "0 / 15", color: VERM, bold: true }, "76.7%"],
  ], 0.6, 1.38, [1.3, 2.2, 1.65, 1.4, 1.7], { rowH: 0.36 });
  table(s, "三次真实运行", [
    ["题目", "耗时", "任务", "模型调用", "token", "并行加速比"],
    ["2025 届高校毕业生就业", "379 秒", "23", "244", "427,689", "3.29"],
    ["2025 年居民人均可支配收入", "436 秒", "21", "265", "559,151", "2.95"],
    ["2025 年新能源汽车销量", "545 秒", "27", "430", "778,209", { text: "3.48", color: VERM, bold: true }],
  ], 0.6, 2.9, [2.75, 1.0, 0.8, 1.1, 1.3, 1.3], { rowH: 0.33 });
  s.addNotes("实验结果全部由评测脚本生成。表五是核查评测：合成集一百条说法，等级准确率百分之九十七点七，误放行为零；真实网页六十条说法，误放行也为零，改进前是十七条里放过三条。抽取召回在七十七到八十八之间，是我们承认的短板。表六是三次真实运行的耗时、任务数、模型调用和并行加速比。另外后端四百八十七项测试通过，端到端界面用例十八个。");
}

// 十四　卷五 创新与不足
{
  const s = page("卷五　创新与展望", "创新点与不足", "可信不靠事后检查，而是{平台的默认行为}");
  [
    ["起草与审核分权", "核查员看不到起草推理，只凭证据判断。"],
    ["逐项流水线并行", "读完一条核查一条，加速 2.95–3.48 倍。"],
    ["有界自循环", "先诊断再修复，不劣才采纳，三重停止条件。"],
    ["声明式且可回放", "YAML 定义、导入即校验，全程事件可回放。"],
  ].forEach(([head, body], i) => {
    const y = 1.42 + i * 0.78;
    ring(s, 0.6, y + 0.02, 0.42, CN[i + 1]);
    T(s, head, { x: 1.2, y, w: 3.4, h: 0.3, fontSize: 14, bold: true, valign: "middle" });
    T(s, body, { x: 1.2, y: y + 0.32, w: 3.4, h: 0.3, fontSize: 12, color: BROWN, valign: "middle" });
  });
  table(s, "不足与改进方向", [
    ["不足", "改进方向"],
    ["样本量有限，置信区间较宽", "扩大真实网页评测集"],
    ["仅接入单一模型", "接入多模型并横向对比"],
    ["无断点续跑", "运行断点续跑"],
    ["无拖拽式编排器", "拖拽式流程搭建"],
    ["反馈优化仅给建议", "从建议走向自动调参"],
  ], 4.85, 1.38, [2.1, 1.9], { rowH: 0.42, left: [1] });
  s.addNotes("最后是创新与不足。四个创新点：起草与审核分权；逐项流水线并行；有界自循环，只在不劣时采纳；声明式定义加全程可回放。不足我们也如实列出：样本量有限、只接入了一个模型、没有断点续跑、没有拖拽式编排器、反馈优化目前只给建议。右栏是对应的改进方向。");
}

// 十五　封底
{
  const s = pres.addSlide();
  n += 1;
  s.background = { path: A("cover.png") };
  rect(s, 1.25, 0.5, 1.0, 4.0, { fill: SLIP, width: 1 });
  rect(s, 1.32, 0.57, 0.86, 3.86, { width: 0.5 });
  vert(s, "敬请批评指正", { x: 1.5, y: 0.8, w: 0.5, h: 2.9, fontSize: 24, bold: true });
  s.addImage({ path: A("seal.png"), x: 1.48, y: 3.72, w: 0.54, h: 0.54 });
  T(s, "三省　写的人不审，审的人不写", { x: 4.2, y: 4.6, w: 5.3, h: 0.34, fontFace: KAI, fontSize: 14, color: LIGHT, align: "right", valign: "middle" });
  s.addNotes("汇报到此结束。三省的核心只有一句话：写的人不审，审的人不写。敬请各位评委批评指正，谢谢。");
}

pres.writeFile({ fileName: OUT }).then((f) => console.log("written", f));
