// 三省 初赛方案讲解 PPT。数字均来自仓库内的实测产物（artifacts/ 与方案书），截图来自 docs/proposal/shots。
// 用法：NODE_PATH=<含 pptxgenjs 的 node_modules> node docs/proposal/make_deck.js
const path = require("path");
const pptxgen = require("pptxgenjs");

const SHOTS = path.join(__dirname, "shots");
const OUT = path.join(__dirname, "三省-方案讲解.pptx");
const INK = "17202B", PAPER = "FFFFFF", RED = "B8372B", BLUE = "2F5D8A", GREEN = "3E7B5A";
const GREY = "5B6573", TINT = "F3F4F6", LINE = "D9DDE3";
const FONT = process.env.DECK_FONT || "Microsoft YaHei";

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10 x 5.625 in
pres.title = "三省：可验证的多智能体编排调度平台";
pres.author = "三省项目组";

let n = 0;
function base(title, dark = false) {
  const s = pres.addSlide();
  n += 1;
  s.background = { color: dark ? INK : PAPER };
  if (title) {
    s.addText(title, {
      x: 0.5, y: 0.3, w: 9, h: 0.7, fontFace: FONT, fontSize: 28, bold: true,
      color: dark ? PAPER : INK, margin: 0, valign: "middle", isTextBox: true,
    });
  }
  s.addText(String(n), {
    x: 9.0, y: 5.2, w: 0.5, h: 0.25, fontFace: FONT, fontSize: 10, color: dark ? "9AA3AF" : "8A929E",
    align: "right", margin: 0, isTextBox: true,
  });
  return s;
}
const T = (s, text, o) => s.addText(text, { fontFace: FONT, margin: 0, isTextBox: true, ...o });
const shot = (s, file, x, y, w) =>
  s.addImage({ path: path.join(SHOTS, file), x, y, w, h: w / 1.6, shadow: { type: "outer", color: "000000", opacity: 0.18, blur: 8, offset: 2, angle: 90 } });
function card(s, x, y, w, h, head, body, color) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: TINT }, line: { color: LINE, width: 0.75 }, rectRadius: 0.08 });
  T(s, head, { x: x + 0.2, y: y + 0.15, w: w - 0.4, h: 0.4, fontSize: 16, bold: true, color, valign: "middle" });
  T(s, body, { x: x + 0.2, y: y + 0.6, w: w - 0.4, h: h - 0.75, fontSize: 13, color: INK, valign: "top", paraSpaceAfter: 4 });
}
function stat(s, x, y, w, big, label, color) {
  T(s, big, { x, y, w, h: 0.75, fontSize: 32, bold: true, color, valign: "middle" });
  T(s, label, { x, y: y + 0.78, w, h: 0.5, fontSize: 12, color: GREY, valign: "top" });
}

// 1 封面
{
  const s = base("", true);
  T(s, "三省", { x: 0.7, y: 1.0, w: 5, h: 1.5, fontSize: 80, bold: true, color: PAPER });
  T(s, "可验证的多智能体编排调度平台", { x: 0.7, y: 2.55, w: 8.6, h: 0.6, fontSize: 28, color: "F2B8AE" });
  T(s, "起草、审核、执行各司其职：写的人不审，审的人不写", { x: 0.7, y: 3.3, w: 8.6, h: 0.4, fontSize: 16, color: "C5CBD3" });
  T(s, "赛题：大模型 Agent 工具编排调度平台  ·  初赛方案讲解", { x: 0.7, y: 4.7, w: 8, h: 0.3, fontSize: 12, color: "9AA3AF" });
  s.addNotes("各位评委好。我们的系统叫三省。名字来自唐代的三省制：起草、审核、执行分开，谁写的谁不能审。这条原则，就是我们整个平台的设计主线。接下来用十几分钟，讲清楚我们做了什么、怎么做的、效果如何。");
}

// 2 问题
{
  const s = base("多智能体编排，难在“可信”而不是“能跑”");
  card(s, 0.5, 1.3, 2.85, 2.6, "自己写、自己审", "大多数 Agent 流水线由同一个模型生成并自评，错误会被同一种偏见放过去。", RED);
  card(s, 3.575, 1.3, 2.85, 2.6, "串行等待", "检索、阅读、核查一环扣一环，整条链路动辄十几分钟，演示和使用都难以接受。", BLUE);
  card(s, 6.65, 1.3, 2.85, 2.6, "失败即重来", "某一步出错，要么整体崩溃，要么悄悄带着错误继续，用户无从知道结果有多可信。", GREEN);
  T(s, "我们的回答：把编排、调度、核查、修复做成平台的内建能力，并且每一步都可回放、可度量。", {
    x: 0.5, y: 4.25, w: 9, h: 0.6, fontSize: 16, bold: true, color: INK, valign: "middle" });
  s.addNotes("先说我们观察到的三个问题。第一，同一个模型既写又审，错误很难被发现。第二，流程串行，慢。第三，出错之后要么整体失败，要么悄悄带着错误往下走，用户并不知道结果到底有多可信。三省要解决的，就是这三件事。");
}

// 3 名字即架构
{
  const s = base("名字即架构：三省对应三类角色");
  const cols = [
    ["中书省", "起草", "规划与撰写：拆解题目、检索资料、生成各章节与结论", BLUE],
    ["门下省", "审核封驳", "独立核查：看不到起草者的推理，只凭证据判断；不合格则封驳", RED],
    ["尚书省", "执行调度", "调度器统一执行：并行、重试、预算、降级、插入修复任务", GREEN],
  ];
  cols.forEach(([name, sub, body, color], i) => {
    const x = 0.5 + i * 3.075;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.25, w: 2.85, h: 2.9, fill: { color: PAPER }, line: { color, width: 1.5 }, rectRadius: 0.08 });
    T(s, name, { x: x + 0.2, y: 1.4, w: 2.45, h: 0.6, fontSize: 28, bold: true, color });
    T(s, sub, { x: x + 0.2, y: 2.0, w: 2.45, h: 0.35, fontSize: 15, color: GREY });
    T(s, body, { x: x + 0.2, y: 2.5, w: 2.45, h: 1.5, fontSize: 14, color: INK, valign: "top" });
  });
  T(s, "界面右上角的 ⓘ 可随时查看这层含义。三个角色在系统里是三类 Agent，而不是三个口号。", {
    x: 0.5, y: 4.4, w: 9, h: 0.5, fontSize: 14, color: GREY, valign: "middle" });
  s.addNotes("三省制里，中书省起草，门下省审核并可以封驳，尚书省负责执行。我们把它对应到系统里：规划与撰写的 Agent、独立核查的 Agent，以及负责调度的执行层。关键在中间这一环：核查者看不到起草者的推理过程，只能凭证据判断，这样才是真正的审核，而不是自己给自己打分。");
}

// 4 总体架构
{
  const s = base("总体架构：一套引擎，两个应用");
  const box = (x, y, w, h, t, sub, color, fill) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: fill || TINT }, line: { color, width: 1 }, rectRadius: 0.06 });
    T(s, t, { x: x + 0.1, y: y + 0.08, w: w - 0.2, h: 0.3, fontSize: 13, bold: true, color, align: "center" });
    if (sub) T(s, sub, { x: x + 0.1, y: y + 0.4, w: w - 0.2, h: h - 0.45, fontSize: 11, color: INK, align: "center", valign: "top" });
  };
  box(0.5, 1.2, 4.3, 0.85, "问答 · LangGraph", "检索纠错、生成纠错，有界循环", BLUE);
  box(5.2, 1.2, 4.3, 0.85, "调研报告 · 编排流水线", "规划→检索→阅读→核查→统稿", BLUE);
  box(0.5, 2.3, 9, 0.85, "编排层：声明式定义（YAML）", "KnowledgeBase · Agent · Team · Workflow · Policy 五类对象，先校验再运行", RED);
  box(0.5, 3.4, 9, 0.85, "调度器：asyncio 自研", "就绪集 · 优先级 · 资源池 · 重试 · 超时 · 预算 · 模型降级 · 运行时插入任务", GREEN);
  box(0.5, 4.5, 2.1, 0.55, "FastAPI", null, GREY, PAPER);
  box(2.77, 4.5, 2.1, 0.55, "PostgreSQL", null, GREY, PAPER);
  box(5.03, 4.5, 2.1, 0.55, "Qdrant", null, GREY, PAPER);
  box(7.3, 4.5, 2.2, 0.55, "Next.js 15", null, GREY, PAPER);
  s.addNotes("架构分三层。最上面是两个应用：问答用 LangGraph 做有界纠错；调研报告走我们的编排流水线。中间是声明式的编排层，工作流用 YAML 描述，运行前先做校验。底下是我们自己写的调度器，基于 asyncio，负责并行、重试、预算和降级。数据层用 PostgreSQL 和 Qdrant，前端是 Next.js。");
}

// 5 声明式编排
{
  const s = base("声明式编排：流程是数据，不是代码");
  shot(s, "spec-yaml.png", 4.5, 1.25, 5.0);
  T(s, [
    { text: "五类对象，YAML 描述", options: { bold: true, breakLine: true, color: RED } },
    { text: "Agent 的角色、技能、模型", options: { bullet: true, breakLine: true } },
    { text: "Workflow 的节点与依赖", options: { bullet: true, breakLine: true } },
    { text: "Policy 的并发、预算、修复轮次", options: { bullet: true, breakLine: true } },
    { text: "运行前校验：依赖成环、引用缺失、模型名非法都在启动前拦下", options: { bullet: true, breakLine: true } },
    { text: "界面可视化为画布，点节点看详情，也可按 Agent 单独指定模型", options: { bullet: true } },
  ], { x: 0.5, y: 1.25, w: 3.8, h: 3.4, fontSize: 14, color: INK, valign: "top", paraSpaceAfter: 6 });
  T(s, "图：编排定义的 YAML 视图（真实界面截图）", { x: 4.5, y: 4.4, w: 5, h: 0.3, fontSize: 11, color: GREY });
  s.addNotes("流程在我们这里是数据。五类对象都用 YAML 声明，运行前先校验，依赖成环、引用不存在这类问题在启动之前就会被拦下。界面上同一份定义会渲染成画布，点击节点可以看详情，也可以给每个 Agent 单独指定模型，或者整体统一一个模型。");
}

// 6 调度器
{
  const s = base("动态调度：边跑边调整，而不是排好队等着");
  shot(s, "orch-live.png", 5.0, 1.25, 4.5);
  T(s, [
    { text: "就绪集 + 优先级：依赖满足即启动", options: { bullet: true, breakLine: true } },
    { text: "检索池与模型池分别限流", options: { bullet: true, breakLine: true } },
    { text: "失败自动重试，超时自动终止", options: { bullet: true, breakLine: true } },
    { text: "预算软限制降级、硬限制停止；非必要任务让路", options: { bullet: true, breakLine: true } },
    { text: "模型额度耗尽时自动换备用模型，不消耗重试次数", options: { bullet: true, breakLine: true } },
    { text: "运行中可以插入新任务（如修复一轮）", options: { bullet: true } },
  ], { x: 0.5, y: 1.25, w: 4.3, h: 3.5, fontSize: 14, color: INK, valign: "top", paraSpaceAfter: 6 });
  T(s, "图：运行中的任务状态与时间线", { x: 5.0, y: 3.9, w: 4.5, h: 0.3, fontSize: 11, color: GREY });
  s.addNotes("调度器是整个平台的核心。依赖满足就启动，按优先级排队，检索和模型调用分别有自己的并发池。失败会重试，超时会终止。预算分软硬两道线：软线之后非必要任务让路，硬线之后停止。如果模型额度用完，会自动切换备用模型，并且不占用重试次数。最后，运行中的任务可以向调度器插入新任务，修复循环就是这样实现的。");
}

// 7 流水线并行
{
  const s = base("流水线并行：每条材料读完就核查，不等整批");
  s.addChart(pres.charts.BAR, [{ name: "并行加速比", labels: ["就业", "收入", "新能源"], values: [3.29, 2.95, 3.48] }], {
    x: 0.5, y: 1.2, w: 4.6, h: 3.4, barDir: "col", chartColors: [BLUE],
    showTitle: true, title: "三次真实运行的并行加速比（倍）", titleFontFace: FONT, titleFontSize: 13, titleColor: INK,
    showValue: true, dataLabelFontFace: FONT, dataLabelFontSize: 12, dataLabelColor: INK, dataLabelFormatCode: "0.00",
    catAxisLabelFontFace: FONT, catAxisLabelFontSize: 12, catAxisLabelColor: GREY,
    valAxisLabelFontFace: FONT, valAxisLabelFontSize: 11, valAxisLabelColor: GREY, valAxisMinVal: 0, valAxisMaxVal: 4,
    valGridLine: { color: "E5E7EB", size: 0.5 }, catGridLine: { style: "none" }, showLegend: false, barGapWidthPct: 80,
  });
  T(s, [
    { text: "怎么做到", options: { bold: true, breakLine: true, color: RED } },
    { text: "下游每一项只依赖上游对应的那一项，上游一项完成，下游马上开始", options: { bullet: true, breakLine: true } },
    { text: "上游某项失败，对应下游项被明确标为失败，不会悄悄当作成功", options: { bullet: true, breakLine: true } },
    { text: "实测：新能源题 545 秒、27 个任务、430 次模型调用，加速比 3.48 倍", options: { bullet: true } },
  ], { x: 5.4, y: 1.3, w: 4.1, h: 3.3, fontSize: 14, color: INK, valign: "top", paraSpaceAfter: 6 });
  s.addNotes("这是我们这一轮做的重点优化。以前阅读完才统一核查，现在每读完一条就立刻核查，下游每一项只等它对应的上游那一项。图里是三次真实运行的并行加速比，就业、收入、新能源分别是三点二九、二点九五、三点四八倍。需要强调的是，上游某一项失败时，对应的下游项会被明确标为失败，而不是悄悄当作成功。");
}

// 8 独立核查
{
  const s = base("独立核查：核查者看不到起草者的推理");
  shot(s, "orch-gate.png", 5.0, 1.25, 4.5);
  T(s, [
    { text: "核查者的可见范围里排除推理过程", options: { bullet: true, breakLine: true } },
    { text: "逐条断言重新核对证据；被两次驳回才定为不成立", options: { bullet: true, breakLine: true } },
    { text: "断言分四级：已核实、单一来源、存在争议、未核实", options: { bullet: true, breakLine: true } },
    { text: "数据点必须能在原文逐字找到", options: { bullet: true } },
  ], { x: 0.5, y: 1.25, w: 4.3, h: 3.2, fontSize: 14, color: INK, valign: "top", paraSpaceAfter: 8 });
  T(s, "图：质量门的判定与披露", { x: 5.0, y: 3.9, w: 4.5, h: 0.3, fontSize: 11, color: GREY });
  s.addNotes("这是三省里门下省的部分。核查者能看到的内容里不包含起草者的推理，只看证据。每条断言单独复核，被驳回两次才定为不成立，避免一次误判就推翻。断言最后分成四级，已核实、单一来源、存在争议、未核实，报告里如实披露。所有数据点必须能在原文里逐字找到。");
}

// 9 有界自循环
{
  const s = base("有界自循环：只在确实变好时才采纳");
  stat(s, 0.5, 1.3, 2.7, "34%→51%", "新能源题：质量门通过率，一轮修复后", RED);
  stat(s, 3.4, 1.3, 2.7, "5 次改写", "4 次被驳回，1 次被采纳", BLUE);
  stat(s, 6.3, 1.3, 3.2, "0 轮修复", "就业、收入两题首轮即达标，不白费调用", GREEN);
  const steps = ["质量门", "诊断失败类型", "定向修复", "复核对比", "采纳或回退"];
  steps.forEach((t, i) => {
    const x = 0.5 + i * 1.82;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 3.1, w: 1.62, h: 0.7, fill: { color: i === 4 ? RED : TINT }, line: { color: LINE, width: 0.75 }, rectRadius: 0.06 });
    T(s, t, { x, y: 3.1, w: 1.62, h: 0.7, fontSize: 13, bold: true, color: i === 4 ? PAPER : INK, align: "center", valign: "middle" });
  });
  T(s, "停止条件：没有进展、达到最大轮次、用掉 60% 预算，三者任一即停。修复结果不比修复前差才采纳。", {
    x: 0.5, y: 4.1, w: 9, h: 0.6, fontSize: 14, color: GREY, valign: "middle" });
  s.addNotes("自纠错必须有界。质量门不过关，先诊断失败类型，再做定向修复，复核后只有结果不比之前差才采纳。停止条件有三个：没有进展、达到最大轮次、预算用到六成。真实运行里，新能源这一题通过率从百分之三十四提高到五十一，五次改写里四次被驳回、一次被采纳。就业和收入两题首轮就达标，系统也就不会白白多花调用。");
}

// 10 问答模块
{
  const s = base("问答：每个结论可追溯到证据和来源");
  shot(s, "chat-answer.png", 0.5, 1.25, 4.5);
  shot(s, "chat-trace.png", 5.0, 1.25, 4.5);
  T(s, "回答与引用", { x: 0.5, y: 3.95, w: 4.5, h: 0.3, fontSize: 12, color: GREY });
  T(s, "纠错过程可展开：检索纠错与生成纠错的每一步", { x: 5.0, y: 3.95, w: 4.5, h: 0.3, fontSize: 12, color: GREY });
  T(s, "Dense + BM25 + RRF + 重排；先诊断失败类型再纠错，最大轮次受限。回答中的结论可点开看到对应证据与来源。", {
    x: 0.5, y: 4.4, w: 9, h: 0.6, fontSize: 14, color: INK, valign: "middle" });
  s.addNotes("问答模块用 LangGraph 做状态和条件路由。检索用稠密加关键词加融合再加重排。回答不是一段文字，而是结论到证据到来源可以逐层追溯。纠错过程可以在界面里展开，看到每一步做了什么，轮次是有上限的。");
}

// 11 调研报告
{
  const s = base("调研报告：同一引擎产出带图表的成稿");
  shot(s, "report-diagrams.png", 0.5, 1.25, 5.3);
  T(s, [
    { text: "折线、柱状、饼图由数据生成", options: { bullet: true, breakLine: true } },
    { text: "框架图、时间线自动绘制", options: { bullet: true, breakLine: true } },
    { text: "导出 PDF / Word，图随文走", options: { bullet: true, breakLine: true } },
    { text: "问答里也能直接渲染图表", options: { bullet: true, breakLine: true } },
    { text: "运行过程同步显示在编排页", options: { bullet: true } },
  ], { x: 6.1, y: 1.3, w: 3.4, h: 2.8, fontSize: 14, color: INK, valign: "top", paraSpaceAfter: 8 });
  T(s, "图：报告中的框架图与时间线", { x: 0.5, y: 4.25, w: 5.3, h: 0.3, fontSize: 11, color: GREY });
  s.addNotes("调研报告模块跑的是同一套引擎。图表由数据生成，不是编的：折线、柱状、饼图，加上自动绘制的框架图和时间线。报告可以导出 PDF 和 Word，图随正文一起走。运行过程会同步显示在编排页，所以你既能看成稿，也能看它是怎么一步步做出来的。");
}

// 12 评测
{
  const s = base("评测：指标由脚本产出，如实报告");
  const H = (t) => ({ text: t, options: { bold: true, color: PAPER, fill: { color: INK }, fontFace: FONT, fontSize: 12, align: "center" } });
  const C = (t, o = {}) => ({ text: t, options: { fontFace: FONT, fontSize: 12, color: INK, align: "center", ...o } });
  s.addTable([
    [H("核查评测"), H("样本"), H("等级准确率"), H("误放行"), H("抽取召回")],
    [C("合成集", { align: "left" }), C("48 例 / 100 断言"), C("97.7%"), C("0 / 46"), C("88%")],
    [C("真实网页", { align: "left" }), C("28 例 / 60 断言"), C("100%（n=46）"), C("0 / 15"), C("76.7%")],
  ], { x: 0.5, y: 1.25, w: 9, colW: [1.8, 2.1, 1.9, 1.5, 1.7], rowH: 0.42, border: { type: "solid", pt: 0.5, color: LINE } });
  stat(s, 0.5, 2.85, 2.9, "487", "后端测试通过（4 项跳过）", BLUE);
  stat(s, 3.55, 2.85, 2.9, "18", "端到端界面测试用例", GREEN);
  stat(s, 6.6, 2.85, 2.9, "13 场景", "P5 评测：Corrective 召回@5 为 0.8，完整方案为 1.0", RED);
  T(s, "说明：样本量有限，置信区间已在方案书中给出；真实网页上改进前的误放行为 3/17。", {
    x: 0.5, y: 4.4, w: 9, h: 0.5, fontSize: 12, color: GREY, valign: "middle" });
  s.addNotes("评测数据全部由脚本生成。核查评测分合成集和真实网页两组：合成集一百条断言，等级准确率百分之九十七点七，误放行零；真实网页六十条断言，误放行零，改进之前这一项是十七条里放过三条。抽取召回在七十七到八十八之间，这是我们承认的短板。另外，后端四百八十七项测试通过，十八个界面端到端用例，P5 的十三个场景里，完整方案召回为一，纠错基线为零点八。");
}

// 13 诚实的局限
{
  const s = base("我们知道的不足，以及下一步");
  card(s, 0.5, 1.3, 4.35, 3.3, "目前的局限", "样本量有限，置信区间较宽\n只接入单一模型\n免费搜索会限流\n没有断点续跑\n无拖拽式编排器\n反馈优化目前只给建议\n断言抽取召回 77% 至 88%", RED);
  card(s, 5.15, 1.3, 4.35, 3.3, "下一步", "接入更多模型并做横向对比\n扩大真实网页评测集\n运行断点续跑\n拖拽式流程搭建\n反馈优化从建议走向自动调参\n公开链接与代码整理", GREEN);
  s.addNotes("我们不回避不足。样本量有限、只接入了一个模型、免费搜索会限流、没有断点续跑、也没有拖拽式编排器。反馈优化目前只给建议，不自动改参数。这些都已经写进方案书的局限章节。下一步我们会按这个清单逐项推进。");
}

// 14 总结
{
  const s = base("", true);
  T(s, "三省", { x: 0.7, y: 0.9, w: 4, h: 0.9, fontSize: 48, bold: true, color: PAPER });
  const items = [
    ["写的人不审，审的人不写", "独立核查，逐条对证据"],
    ["声明、调度、修复都在平台里", "流程是数据，运行可回放"],
    ["只在确实变好时才采纳", "有界自循环，如实披露不足"],
  ];
  items.forEach(([a, b], i) => {
    const y = 2.1 + i * 0.95;
    T(s, a, { x: 0.7, y, w: 8.6, h: 0.45, fontSize: 22, bold: true, color: "F2B8AE" });
    T(s, b, { x: 0.7, y: y + 0.45, w: 8.6, h: 0.35, fontSize: 15, color: "C5CBD3" });
  });
  T(s, "谢谢各位评委", { x: 0.7, y: 4.85, w: 6, h: 0.35, fontSize: 14, color: "9AA3AF" });
  s.addNotes("最后总结三句话。写的人不审，审的人不写；声明、调度、修复都在平台里，运行可回放；只在确实变好的时候才采纳修改，并且如实披露不足。谢谢各位评委。");
}

pres.writeFile({ fileName: OUT }).then((f) => console.log("written", f));
