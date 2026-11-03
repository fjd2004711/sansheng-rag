// 三省 初赛方案讲解 PPT（大创国赛风格：深蓝主色、页眉标题栏、目录、章节编号、技术路线图、创新点卡片）。
// 数字均来自仓库内的实测产物（artifacts/ 与方案书），截图来自 docs/proposal/shots。
// 用法：NODE_PATH=<含 pptxgenjs 的 node_modules> node docs/proposal/make_deck.js
const path = require("path");
const pptxgen = require("pptxgenjs");

const SHOTS = path.join(__dirname, "shots");
const OUT = process.env.DECK_OUT || path.join(__dirname, "三省-方案讲解.pptx");
const NAVY = "0B2E6B", BLUE = "1F5FBF", SKY = "E8F0FB", GOLD = "E0A526", PAPER = "FFFFFF";
const TEXT = "1F2937", GREY = "6B7280", LINE = "D5DEEC";
const ZHONG = "1F5FBF", MEN = "C0392B", SHANG = "2E7D5B"; // 中书省 / 门下省 / 尚书省
const FONT = process.env.DECK_FONT || "Microsoft YaHei";
const TAG = "三省 · 可验证的多智能体编排调度平台";

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10 x 5.625 in
pres.title = "三省：可验证的多智能体编排调度平台";
pres.author = "三省项目组";

let n = 0;
const T = (s, text, o) => s.addText(text, { fontFace: FONT, margin: 0, isTextBox: true, ...o });
const shadow = () => ({ type: "outer", color: "1F3A6B", opacity: 0.16, blur: 8, offset: 2, angle: 90 });

function page(title, section) {
  const s = pres.addSlide();
  n += 1;
  s.background = { color: PAPER };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.85, fill: { color: NAVY }, line: { color: NAVY, width: 0 } });
  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 0.25, w: 0.08, h: 0.35, fill: { color: GOLD }, line: { color: GOLD, width: 0 } });
  T(s, title, { x: 0.72, y: 0.12, w: 6.6, h: 0.6, fontSize: 22, bold: true, color: PAPER, valign: "middle" });
  if (section) T(s, section, { x: 7.4, y: 0.12, w: 2.1, h: 0.6, fontSize: 12, color: GOLD, align: "right", valign: "middle", bold: true });
  T(s, TAG, { x: 0.5, y: 5.28, w: 6, h: 0.25, fontSize: 10, color: GREY, valign: "middle" });
  T(s, String(n), { x: 9.0, y: 5.28, w: 0.5, h: 0.25, fontSize: 10, color: GREY, align: "right", valign: "middle" });
  return s;
}
const shot = (s, file, x, y, w) => {
  const h = w / 1.6;
  s.addShape(pres.shapes.RECTANGLE, { x: x - 0.04, y: y - 0.04, w: w + 0.08, h: h + 0.08, fill: { color: PAPER }, line: { color: LINE, width: 1 }, shadow: shadow() });
  s.addImage({ path: path.join(SHOTS, file), x, y, w, h });
  return y + h;
};
const num = (s, x, y, d, label, fill = BLUE) => {
  s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill, width: 0 } });
  T(s, label, { x, y, w: d, h: d, fontSize: d > 0.5 ? 18 : 14, bold: true, color: PAPER, align: "center", valign: "middle" });
};
const card = (s, x, y, w, h, fill = PAPER) =>
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: fill }, line: { color: LINE, width: 0.75 }, rectRadius: 0.06, shadow: shadow() });
const box = (s, x, y, w, h, text, color, o = {}) => {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: o.fill || color }, line: { color, width: 1 }, rectRadius: 0.06 });
  T(s, text, { x, y, w, h, fontSize: o.size || 13, bold: true, color: o.fill ? color : PAPER, align: "center", valign: "middle" });
};
const arrow = (s, x1, y1, x2, y2, color = GREY) =>
  s.addShape(pres.shapes.LINE, {
    x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
    flipH: x2 < x1, flipV: y2 < y1, line: { color, width: 1.5, endArrowType: "triangle" },
  });
const bullets = (items) => items.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < items.length - 1 } }));
const caption = (s, text, x, y, w) => T(s, text, { x, y, w, h: 0.28, fontSize: 11, color: GREY, align: "center", valign: "middle" });

// 1 封面
{
  const s = pres.addSlide();
  n += 1;
  s.background = { color: NAVY };
  [[6.3, -0.6, 3.6, ZHONG], [7.7, 1.2, 3.2, MEN], [5.7, 2.4, 3.4, SHANG]].forEach(([x, y, d, c]) =>
    s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: c, transparency: 55 }, line: { color: c, width: 0 } }));
  T(s, "中书", { x: 6.9, y: 0.7, w: 1.4, h: 0.5, fontSize: 18, bold: true, color: PAPER, align: "center" });
  T(s, "门下", { x: 8.5, y: 2.3, w: 1.2, h: 0.5, fontSize: 18, bold: true, color: PAPER, align: "center" });
  T(s, "尚书", { x: 6.5, y: 3.8, w: 1.4, h: 0.5, fontSize: 18, bold: true, color: PAPER, align: "center" });
  T(s, "赛题：大模型 Agent 工具编排调度平台 · 初赛", { x: 0.7, y: 0.8, w: 5.4, h: 0.35, fontSize: 12, color: GOLD, valign: "middle" });
  T(s, "三省", { x: 0.7, y: 1.5, w: 4.5, h: 1.5, fontSize: 80, bold: true, color: PAPER, valign: "middle" });
  T(s, "可验证的多智能体编排调度平台", { x: 0.7, y: 3.05, w: 5.4, h: 0.5, fontSize: 22, bold: true, color: GOLD, valign: "middle" });
  T(s, "起草、审核、执行各司其职\n写的人不审，审的人不写", { x: 0.7, y: 3.7, w: 5.2, h: 0.8, fontSize: 15, color: "C9D6EE", valign: "top" });
  T(s, "方案讲解", { x: 0.7, y: 4.8, w: 3, h: 0.3, fontSize: 12, color: "9DB2D8" });
  s.addNotes("各位评委好。我们的系统叫三省，名字来自唐代的三省制：中书省起草，门下省审核，尚书省执行，谁写的谁不审。右边三个圆就是这三个角色，它们也是我们系统里的三类 Agent。接下来我用十几分钟讲清楚我们做了什么、怎么做的、效果如何。");
}

// 2 目录
{
  const s = pres.addSlide();
  n += 1;
  s.background = { color: PAPER };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 3.4, h: 5.625, fill: { color: NAVY }, line: { color: NAVY, width: 0 } });
  T(s, "目录", { x: 0.5, y: 1.9, w: 2.6, h: 0.9, fontSize: 40, bold: true, color: PAPER, valign: "middle" });
  T(s, "CONTENTS", { x: 0.5, y: 2.85, w: 2.6, h: 0.35, fontSize: 14, color: GOLD, valign: "middle" });
  const rows = [
    ["01", "项目背景", "多智能体编排的三道坎"],
    ["02", "总体设计", "三省架构与技术路线"],
    ["03", "关键技术", "编排、调度、并行、核查、自循环"],
    ["04", "应用与实验", "真实界面与实测数据"],
    ["05", "创新与展望", "创新点、不足与下一步"],
  ];
  rows.forEach(([no, a, b], i) => {
    const y = 0.7 + i * 0.9;
    num(s, 4.0, y, 0.62, no, i % 2 ? BLUE : NAVY);
    T(s, a, { x: 4.85, y: y - 0.02, w: 4.5, h: 0.4, fontSize: 20, bold: true, color: NAVY, valign: "middle" });
    T(s, b, { x: 4.85, y: y + 0.36, w: 4.6, h: 0.3, fontSize: 13, color: GREY, valign: "middle" });
  });
  s.addNotes("汇报分五个部分：项目背景、总体设计、关键技术、应用与实验，最后是创新点与展望。");
}

// 3 背景
{
  const s = page("多智能体编排的三道坎", "01 项目背景");
  const items = [
    ["01", "自己写，自己审", "多数流水线由同一个模型生成并自评，同一种偏见会把错误一起放过去。", MEN],
    ["02", "串行等待", "检索、阅读、核查一环扣一环，整条链路动辄十几分钟，难以演示和使用。", BLUE],
    ["03", "失败即重来", "某一步出错，要么整体崩溃，要么悄悄带着错误继续，用户无从判断结果多可信。", SHANG],
  ];
  items.forEach(([no, head, body, c], i) => {
    const x = 0.5 + i * 3.075;
    card(s, x, 1.15, 2.85, 2.75);
    num(s, x + 0.2, 1.35, 0.6, no, c);
    T(s, head, { x: x + 0.95, y: 1.35, w: 1.8, h: 0.6, fontSize: 16, bold: true, color: NAVY, valign: "middle" });
    T(s, body, { x: x + 0.2, y: 2.15, w: 2.45, h: 1.6, fontSize: 14, color: TEXT, valign: "top" });
  });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.5, y: 4.2, w: 9, h: 0.8, fill: { color: SKY }, line: { color: SKY, width: 0 }, rectRadius: 0.06 });
  T(s, "核心问题：怎样让多智能体系统既跑得快，又让人信得过？", { x: 0.7, y: 4.2, w: 8.6, h: 0.8, fontSize: 18, bold: true, color: NAVY, valign: "middle" });
  s.addNotes("先说我们观察到的三个问题。第一，同一个模型既写又审，错误很难被发现。第二，流程串行，慢。第三，出错之后要么整体失败，要么悄悄带着错误往下走，用户不知道结果到底有多可信。归结起来就是一个问题：怎样既快又可信。");
}

// 4 项目定位
{
  const s = page("项目定位：以三省制命名的可验证编排平台", "02 总体设计");
  const cols = [
    ["中书省", "起草", "规划、检索、撰写：拆解题目，生成各章节与结论", ZHONG],
    ["门下省", "审核封驳", "独立核查：看不到起草者的推理，只凭证据判断，不合格则封驳", MEN],
    ["尚书省", "执行调度", "调度器统一执行：并行、重试、预算、降级、插入修复任务", SHANG],
  ];
  cols.forEach(([name, sub, body, c], i) => {
    const x = 0.5 + i * 3.075;
    card(s, x, 1.15, 2.6, 2.45);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.15, w: 2.6, h: 0.75, fill: { color: c }, line: { color: c, width: 0 }, rectRadius: 0.06 });
    T(s, name + "  " + sub, { x, y: 1.15, w: 2.6, h: 0.75, fontSize: 18, bold: true, color: PAPER, align: "center", valign: "middle" });
    T(s, body, { x: x + 0.18, y: 2.05, w: 2.25, h: 1.45, fontSize: 13, color: TEXT, valign: "top" });
    if (i < 2) arrow(s, x + 2.65, 2.4, x + 3.05, 2.4, GREY);
  });
  T(s, "赛题要求对应的五项能力", { x: 0.5, y: 3.8, w: 5, h: 0.3, fontSize: 14, bold: true, color: NAVY, valign: "middle" });
  ["声明式定义", "动态调度", "独立核查", "有界自循环", "反馈优化"].forEach((t, i) =>
    box(s, 0.5 + i * 1.82, 4.2, 1.65, 0.6, t, NAVY, { fill: SKY, size: 14 }));
  s.addNotes("三省制里，中书省起草，门下省审核并可以封驳，尚书省负责执行。我们把它对应到系统：规划与撰写的 Agent、独立核查的 Agent，以及负责调度的执行层。核查者看不到起草者的推理，只凭证据判断，这才是真正的审核。下面五项，对应赛题要的编排平台能力。");
}

// 5 总体架构
{
  const s = page("总体架构：一套引擎，两个应用", "02 总体设计");
  const layers = [
    ["应用层", [["问答 · LangGraph", "检索纠错 · 生成纠错 · 有界循环"], ["调研报告 · 编排流水线", "规划 → 检索 → 阅读 → 核查 → 统稿"]], BLUE],
    ["编排层", [["声明式定义（YAML）", "知识库 · Agent · 团队 · 工作流 · 策略，运行前先校验"]], NAVY],
    ["调度层", [["asyncio 自研调度器", "就绪集 · 优先级 · 资源池 · 重试 · 超时 · 预算 · 模型降级 · 运行时插入任务"]], SHANG],
    ["基础设施", [["FastAPI", ""], ["PostgreSQL", ""], ["Qdrant", ""], ["Next.js 15", ""]], GREY],
  ];
  layers.forEach(([name, parts, c], i) => {
    const y = 1.1 + i * 1.0;
    box(s, 0.5, y, 1.3, 0.78, name, c, { size: 15 });
    const w = (7.5 - (parts.length - 1) * 0.15) / parts.length;
    parts.forEach(([a, b], j) => {
      const x = 2.0 + j * (w + 0.15);
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 0.78, fill: { color: SKY }, line: { color: c, width: 1 }, rectRadius: 0.06 });
      T(s, a, { x: x + 0.1, y: y + (b ? 0.06 : 0), w: w - 0.2, h: b ? 0.3 : 0.78, fontSize: 13, bold: true, color: NAVY, align: "center", valign: "middle" });
      if (b) T(s, b, { x: x + 0.1, y: y + 0.36, w: w - 0.2, h: 0.38, fontSize: 11, color: TEXT, align: "center", valign: "middle" });
    });
    if (i < 3) arrow(s, 5.75, y + 0.78, 5.75, y + 1.0, GREY);
  });
  s.addNotes("架构分四层。最上面是两个应用：问答用 LangGraph 做有界纠错；调研报告走我们的编排流水线。第二层是声明式的编排层，工作流用 YAML 描述，运行前先校验。第三层是自研的调度器，基于 asyncio，负责并行、重试、预算和降级。最下面是数据与基础设施。");
}

// 6 技术路线
{
  const s = page("技术路线：起草、审核、修复、统稿", "02 总体设计");
  const nodes = [["规划", ZHONG], ["检索", ZHONG], ["阅读", ZHONG], ["逐项核查", MEN], ["质量门", MEN], ["统稿披露", SHANG]];
  const w = 1.35, gap = 0.18;
  nodes.forEach(([t, c], i) => {
    const x = 0.5 + i * (w + gap);
    box(s, x, 1.2, w, 0.7, t, c, { size: 14 });
    if (i < 5) arrow(s, x + w, 1.55, x + w + gap, 1.55, GREY);
  });
  const gateX = 0.5 + 4 * (w + gap) + w / 2, mergeX = 0.5 + 5 * (w + gap) + w / 2;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.5, y: 2.6, w: 9, h: 1.55, fill: { color: SKY }, line: { color: BLUE, width: 1, dashType: "dash" }, rectRadius: 0.08 });
  T(s, "有界自循环（不达标时触发）", { x: 0.7, y: 2.65, w: 4, h: 0.32, fontSize: 13, bold: true, color: NAVY, valign: "middle" });
  [["诊断失败类型", MEN], ["定向修复", ZHONG], ["复核对比", MEN], ["不差才采纳", SHANG]].forEach(([t, c], i) => {
    const x = 0.8 + i * 2.1;
    box(s, x, 3.2, 1.7, 0.6, t, c, { size: 13 });
    if (i < 3) arrow(s, x + 1.7, 3.5, x + 2.1, 3.5, GREY);
  });
  arrow(s, gateX, 1.9, gateX, 2.6, MEN);
  arrow(s, mergeX, 2.6, mergeX, 1.9, SHANG);
  T(s, "未达标", { x: gateX - 1.1, y: 2.15, w: 1.0, h: 0.3, fontSize: 11, color: MEN, align: "right", valign: "middle" });
  T(s, "达标", { x: mergeX + 0.1, y: 2.15, w: 0.8, h: 0.3, fontSize: 11, color: SHANG, valign: "middle" });
  [["中书省 · 起草", ZHONG], ["门下省 · 审核", MEN], ["尚书省 · 执行与披露", SHANG]].forEach(([t, c], i) => {
    const x = 0.5 + i * 3.1;
    s.addShape(pres.shapes.OVAL, { x, y: 4.52, w: 0.2, h: 0.2, fill: { color: c }, line: { color: c, width: 0 } });
    T(s, t, { x: x + 0.3, y: 4.44, w: 2.6, h: 0.36, fontSize: 12, color: TEXT, valign: "middle" });
  });
  s.addNotes("这是一次运行的技术路线。蓝色是中书省：规划、检索、阅读。红色是门下省：逐项核查和质量门。绿色是尚书省：统稿和披露。质量门没通过，就进入下面的有界自循环：诊断失败类型、定向修复、复核对比，只有结果不比修复前差才采纳。通过之后进入统稿，并把不确定的地方如实披露。");
}

// 7 编排与调度
{
  const s = page("关键技术一：声明式编排与动态调度", "03 关键技术");
  const y1 = shot(s, "spec-yaml.png", 0.5, 1.1, 4.3);
  const y2 = shot(s, "orch-live.png", 5.2, 1.1, 4.3);
  caption(s, "声明式编排：YAML 定义，运行前校验", 0.5, y1 + 0.08, 4.3);
  caption(s, "动态调度：运行中的任务与时间线", 5.2, y2 + 0.08, 4.3);
  T(s, bullets(["五类对象，流程是数据而不是代码", "依赖成环、引用缺失在启动前拦下", "每个 Agent 可单独指定模型"]),
    { x: 0.5, y: 4.15, w: 4.3, h: 1.0, fontSize: 13, color: TEXT, valign: "top", paraSpaceAfter: 3 });
  T(s, bullets(["就绪即启动，检索池与模型池分别限流", "重试、超时、预算软硬限制与模型降级", "运行中可插入新任务，修复循环由此实现"]),
    { x: 5.2, y: 4.15, w: 4.3, h: 1.0, fontSize: 13, color: TEXT, valign: "top", paraSpaceAfter: 3 });
  s.addNotes("左边是声明式编排。流程在我们这里是数据，五类对象用 YAML 声明，运行前先校验，依赖成环、引用不存在这类问题在启动之前就会被拦下，每个 Agent 也能单独指定模型。右边是动态调度：依赖满足就启动，检索和模型调用各有并发池，失败重试，超时终止，预算分软硬两道线，额度用完自动换模型，运行中还能向调度器插入新任务，修复循环就是这样实现的。");
}

// 8 流水线并行
{
  const s = page("关键技术二：流水线并行，读完一条就核查一条", "03 关键技术");
  s.addChart(pres.charts.BAR, [{ name: "并行加速比", labels: ["就业", "收入", "新能源"], values: [3.29, 2.95, 3.48] }], {
    x: 0.5, y: 1.1, w: 4.4, h: 3.2, barDir: "col", chartColors: [BLUE],
    showTitle: true, title: "三次真实运行的并行加速比（倍）", titleFontFace: FONT, titleFontSize: 12, titleColor: NAVY,
    showValue: true, dataLabelFontFace: FONT, dataLabelFontSize: 12, dataLabelColor: TEXT, dataLabelFormatCode: "0.00",
    catAxisLabelFontFace: FONT, catAxisLabelFontSize: 12, catAxisLabelColor: GREY,
    valAxisLabelFontFace: FONT, valAxisLabelFontSize: 11, valAxisLabelColor: GREY, valAxisMinVal: 0, valAxisMaxVal: 4,
    valGridLine: { color: "E5E7EB", size: 0.5 }, catGridLine: { style: "none" }, showLegend: false, barGapWidthPct: 80,
  });
  const x0 = 5.5, u = 0.6;
  T(s, "整批等待", { x: x0, y: 1.15, w: 3, h: 0.3, fontSize: 13, bold: true, color: NAVY, valign: "middle" });
  ["A", "B", "C"].forEach((k, i) => box(s, x0 + i * u, 1.5, u - 0.04, 0.4, "读" + k, ZHONG, { size: 11 }));
  ["A", "B", "C"].forEach((k, i) => box(s, x0 + (3 + i) * u, 1.5, u - 0.04, 0.4, "核" + k, MEN, { size: 11 }));
  T(s, "共 6 格", { x: x0, y: 1.95, w: 3, h: 0.25, fontSize: 11, color: GREY, valign: "middle" });
  T(s, "流水线", { x: x0, y: 2.4, w: 3, h: 0.3, fontSize: 13, bold: true, color: NAVY, valign: "middle" });
  ["A", "B", "C"].forEach((k, i) => box(s, x0 + i * u, 2.75, u - 0.04, 0.4, "读" + k, ZHONG, { size: 11 }));
  ["A", "B", "C"].forEach((k, i) => box(s, x0 + (i + 1) * u, 3.2, u - 0.04, 0.4, "核" + k, MEN, { size: 11 }));
  T(s, "共 4 格", { x: x0, y: 3.65, w: 3, h: 0.25, fontSize: 11, color: GREY, valign: "middle" });
  T(s, bullets([
    "下游每一项只依赖上游对应的那一项",
    "上游某项失败，对应下游项明确标为失败",
    "新能源题：545 秒，27 个任务，430 次调用",
  ]), { x: 0.5, y: 4.4, w: 9, h: 0.8, fontSize: 13, color: TEXT, valign: "top", paraSpaceAfter: 2 });
  s.addNotes("这是我们重点优化的地方。以前阅读完才统一核查，现在每读完一条就立刻核查，下游每一项只等它对应的上游那一项，右边的示意图是这个思路。左边是三次真实运行的并行加速比，就业、收入、新能源分别是三点二九、二点九五、三点四八倍。上游某项失败时，对应的下游项会被明确标为失败，不会悄悄当作成功。");
}

// 9 独立核查
{
  const s = page("关键技术三：独立核查，逐条断言对证据", "03 关键技术");
  const y = shot(s, "orch-gate.png", 0.5, 1.1, 4.9);
  caption(s, "质量门的判定与披露（真实界面）", 0.5, y + 0.08, 4.9);
  T(s, "断言分四级，如实披露", { x: 5.8, y: 1.1, w: 3.7, h: 0.35, fontSize: 15, bold: true, color: NAVY, valign: "middle" });
  [["已核实", SHANG, "多个独立来源一致"], ["单一来源", BLUE, "仅一处出处"], ["存在争议", GOLD, "来源之间矛盾"], ["未核实", GREY, "找不到支撑"]].forEach(([a, c, b], i) => {
    const yy = 1.55 + i * 0.62;
    box(s, 5.8, yy, 1.2, 0.5, a, c, { size: 13 });
    T(s, b, { x: 7.15, y: yy, w: 2.35, h: 0.5, fontSize: 12, color: TEXT, valign: "middle" });
  });
  T(s, bullets(["核查者的可见范围排除起草者的推理", "被两次驳回才定为不成立，避免误杀", "数据点必须能在原文逐字找到"]),
    { x: 0.5, y: 4.25, w: 9, h: 0.9, fontSize: 13, color: TEXT, valign: "top", paraSpaceAfter: 2 });
  s.addNotes("这是门下省的部分。核查者能看到的内容里不包含起草者的推理，只看证据。每条断言单独复核，被驳回两次才定为不成立，避免一次误判就推翻。断言最后分成四级：已核实、单一来源、存在争议、未核实，报告里如实披露。所有数据点必须能在原文里逐字找到。");
}

// 10 有界自循环
{
  const s = page("关键技术四：有界自循环，只在变好时才采纳", "03 关键技术");
  const bx = [[0.7, 1.3], [2.9, 1.3], [2.9, 3.2], [0.7, 3.2]];
  [["质量门", MEN], ["诊断失败类型", MEN], ["定向修复", ZHONG], ["复核对比", MEN]].forEach(([t, c], i) =>
    box(s, bx[i][0], bx[i][1], 1.8, 0.8, t, c, { size: 14 }));
  arrow(s, 2.5, 1.7, 2.9, 1.7);
  arrow(s, 3.8, 2.1, 3.8, 3.2);
  arrow(s, 2.9, 3.6, 2.5, 3.6);
  arrow(s, 1.6, 3.2, 1.6, 2.1);
  T(s, "最多若干轮", { x: 1.55, y: 2.45, w: 2.3, h: 0.4, fontSize: 12, color: GREY, align: "center", valign: "middle" });
  [["34%→51%", "新能源题质量门通过率，一轮修复后", MEN], ["5 次改写", "4 次被驳回，1 次被采纳", BLUE], ["0 轮修复", "就业、收入两题首轮即达标", SHANG]].forEach(([big, lab, c], i) => {
    const yy = 1.15 + i * 1.05;
    card(s, 5.4, yy, 4.1, 0.9);
    T(s, big, { x: 5.55, y: yy, w: 1.85, h: 0.9, fontSize: 22, bold: true, color: c, valign: "middle" });
    T(s, lab, { x: 7.4, y: yy, w: 2.0, h: 0.9, fontSize: 12, color: TEXT, valign: "middle" });
  });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.5, y: 4.4, w: 9, h: 0.65, fill: { color: SKY }, line: { color: SKY, width: 0 }, rectRadius: 0.06 });
  T(s, "停止条件：没有进展、达到最大轮次、用掉 60% 预算，任一即停；修复结果不比修复前差才采纳", { x: 0.7, y: 4.4, w: 8.6, h: 0.65, fontSize: 13, bold: true, color: NAVY, valign: "middle" });
  s.addNotes("自纠错必须有界。质量门不过关，先诊断失败类型，再做定向修复，复核后只有结果不比之前差才采纳。停止条件有三个：没有进展、达到最大轮次、预算用到六成。真实运行里，新能源这一题通过率从百分之三十四提高到五十一，五次改写里四次被驳回、一次被采纳。就业和收入两题首轮就达标，系统不会白白多花调用。");
}

// 11 应用展示
{
  const s = page("应用展示：问答可追溯，报告带图表", "04 应用与实验");
  const y1 = shot(s, "chat-answer.png", 0.5, 1.1, 4.3);
  const y2 = shot(s, "report-diagrams.png", 5.2, 1.1, 4.3);
  num(s, 0.5, y1 + 0.12, 0.4, "1", NAVY);
  num(s, 5.2, y2 + 0.12, 0.4, "2", NAVY);
  T(s, "问答：结论 → 证据 → 来源可追溯", { x: 1.0, y: y1 + 0.12, w: 3.8, h: 0.4, fontSize: 13, bold: true, color: NAVY, valign: "middle" });
  T(s, "调研报告：图表、框架图与时间线", { x: 5.7, y: y2 + 0.12, w: 3.8, h: 0.4, fontSize: 13, bold: true, color: NAVY, valign: "middle" });
  T(s, bullets(["Dense + BM25 + RRF + 重排", "纠错过程可展开，轮次有上限"]),
    { x: 0.5, y: 4.4, w: 4.3, h: 0.75, fontSize: 12, color: TEXT, valign: "top", paraSpaceAfter: 2 });
  T(s, bullets(["折线、柱状、饼图由数据生成", "可导出 PDF / Word，过程同步显示在编排页"]),
    { x: 5.2, y: 4.4, w: 4.3, h: 0.75, fontSize: 12, color: TEXT, valign: "top", paraSpaceAfter: 2 });
  s.addNotes("两个应用跑在同一套引擎上。左边是问答，用 LangGraph 做状态和条件路由，回答中的结论可以逐层追溯到证据和来源，纠错过程可展开，轮次有上限。右边是调研报告，图表由数据生成，不是编的，可以导出 PDF 和 Word，运行过程同步显示在编排页。");
}

// 12 实验结果
{
  const s = page("实验结果：指标由脚本产出，如实报告", "04 应用与实验");
  const H = (t) => ({ text: t, options: { bold: true, color: PAPER, fill: { color: NAVY }, fontFace: FONT, fontSize: 12, align: "center", valign: "middle" } });
  const C = (t, o = {}) => ({ text: t, options: { fontFace: FONT, fontSize: 12, color: TEXT, align: "center", valign: "middle", ...o } });
  const alt = { fill: { color: SKY } };
  s.addTable([
    [H("核查评测"), H("样本"), H("等级准确率"), H("误放行"), H("抽取召回")],
    [C("合成集", { align: "left", bold: true }), C("48 例 / 100 断言"), C("97.7%"), C("0 / 46"), C("88%")],
    [C("真实网页", { align: "left", bold: true, ...alt }), C("28 例 / 60 断言", alt), C("100%（n=46）", alt), C("0 / 15", alt), C("76.7%", alt)],
  ], { x: 0.5, y: 1.1, w: 9, colW: [1.8, 2.1, 1.9, 1.5, 1.7], rowH: 0.45, border: { type: "solid", pt: 0.5, color: LINE } });
  [["487", "后端测试通过\n（另有 4 项跳过）", BLUE], ["18", "端到端界面\n测试用例", SHANG], ["3 / 17", "真实网页上改进前\n的误放行", MEN], ["13 场景", "P5 评测：完整方案召回 1.0\n纠错基线 0.8", NAVY]].forEach(([big, lab, c], i) => {
    const x = 0.5 + i * 2.28;
    card(s, x, 2.75, 2.1, 1.75);
    T(s, big, { x: x + 0.1, y: 2.85, w: 1.9, h: 0.8, fontSize: 26, bold: true, color: c, align: "center", valign: "middle" });
    T(s, lab, { x: x + 0.1, y: 3.65, w: 1.9, h: 0.75, fontSize: 11, color: GREY, align: "center", valign: "top" });
  });
  T(s, "说明：样本量有限，置信区间已在方案书中给出。", { x: 0.5, y: 4.7, w: 9, h: 0.35, fontSize: 12, color: GREY, valign: "middle" });
  s.addNotes("评测数据全部由脚本生成。核查评测分合成集和真实网页两组：合成集一百条断言，等级准确率百分之九十七点七，误放行零；真实网页六十条断言，误放行零，改进之前这一项是十七条里放过三条。抽取召回在七十七到八十八之间，这是我们承认的短板。另外，后端四百八十七项测试通过，十八个界面端到端用例，P5 的十三个场景里，完整方案召回为一，纠错基线为零点八。");
}

// 13 创新点
{
  const s = page("创新点", "05 创新与展望");
  [
    ["起草与审核分权", "核查者看不到起草者的推理，只凭证据判断，写的人不审，审的人不写。"],
    ["流水线逐项并行", "每读完一条就核查一条，三次真实运行并行加速比 2.95 至 3.48 倍。"],
    ["有界自循环", "先诊断再修复，只在结果不比之前差时采纳，并设有三重停止条件。"],
    ["声明式且可回放", "流程用 YAML 声明、运行前校验，每一步事件可回放、可度量。"],
  ].forEach(([head, body], i) => {
    const x = 0.5 + (i % 2) * 4.6, y = 1.15 + Math.floor(i / 2) * 2.0;
    card(s, x, y, 4.4, 1.8);
    num(s, x + 0.25, y + 0.3, 0.7, String(i + 1), i % 2 ? BLUE : NAVY);
    T(s, head, { x: x + 1.15, y: y + 0.25, w: 3.1, h: 0.45, fontSize: 17, bold: true, color: NAVY, valign: "middle" });
    T(s, body, { x: x + 1.15, y: y + 0.8, w: 3.1, h: 0.9, fontSize: 13, color: TEXT, valign: "top" });
  });
  s.addNotes("总结四个创新点。一，起草与审核分权，核查者看不到起草者的推理。二，流水线逐项并行，加速比接近三倍。三，有界自循环，先诊断再修复，只在变好时采纳。四，声明式定义加运行回放，每一步都可度量。");
}

// 14 不足与展望
{
  const s = page("不足与展望", "05 创新与展望");
  const rows = [
    ["样本量有限，置信区间较宽", "扩大真实网页评测集"],
    ["只接入单一模型", "接入更多模型并横向对比"],
    ["没有断点续跑", "运行断点续跑"],
    ["没有拖拽式编排器", "拖拽式流程搭建"],
    ["反馈优化目前只给建议", "从建议走向自动调参"],
    ["断言抽取召回 77% 至 88%", "改进抽取，补齐召回"],
  ];
  T(s, "目前的不足", { x: 0.5, y: 1.05, w: 4.2, h: 0.35, fontSize: 15, bold: true, color: MEN, valign: "middle" });
  T(s, "下一步", { x: 5.3, y: 1.05, w: 4.2, h: 0.35, fontSize: 15, bold: true, color: SHANG, valign: "middle" });
  rows.forEach(([a, b], i) => {
    const y = 1.5 + i * 0.6;
    box(s, 0.5, y, 4.2, 0.48, a, MEN, { fill: "FBECEA", size: 12 });
    arrow(s, 4.75, y + 0.24, 5.25, y + 0.24, GREY);
    box(s, 5.3, y, 4.2, 0.48, b, SHANG, { fill: "E7F3EC", size: 12 });
  });
  s.addNotes("我们不回避不足。样本量有限、只接入了一个模型、没有断点续跑、也没有拖拽式编排器，反馈优化目前只给建议，抽取召回还不够高。这些都写进了方案书的局限章节，下一步我们按右边这张清单逐项推进。");
}

// 15 致谢
{
  const s = pres.addSlide();
  n += 1;
  s.background = { color: NAVY };
  [[6.6, 0.4, 3.2, ZHONG], [7.9, 2.0, 2.8, MEN], [6.2, 2.8, 3.0, SHANG]].forEach(([x, y, d, c]) =>
    s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: c, transparency: 60 }, line: { color: c, width: 0 } }));
  T(s, "感谢聆听", { x: 0.7, y: 1.6, w: 5.5, h: 1.0, fontSize: 48, bold: true, color: PAPER, valign: "middle" });
  T(s, "恳请各位评委批评指正", { x: 0.7, y: 2.7, w: 5.5, h: 0.5, fontSize: 18, color: GOLD, valign: "middle" });
  T(s, "三省 · 写的人不审，审的人不写", { x: 0.7, y: 4.6, w: 5.5, h: 0.4, fontSize: 14, color: "9DB2D8", valign: "middle" });
  s.addNotes("我的汇报就到这里。三省的核心就一句话：写的人不审，审的人不写。谢谢各位评委，恳请批评指正。");
}

pres.writeFile({ fileName: OUT }).then((f) => console.log("written", f));
