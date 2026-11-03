// 三省 初赛方案讲解 PPT（参照中国国际大学生创新大赛获奖路演稿的做法：深色科技底、结论式标题、
// 满幅封面、实物截图为证据、关键数字金色放大、底部结论条）。
// 数字均来自仓库内的实测产物（artifacts/ 与方案书）；图片由 make_deck_assets.py 生成。
// 用法：python docs/proposal/make_deck_assets.py && NODE_PATH=<含 pptxgenjs 的 node_modules> node docs/proposal/make_deck.js
const path = require("path");
const pptxgen = require("pptxgenjs");

const ASSETS = path.join(__dirname, "deck_assets");
const OUT = process.env.DECK_OUT || path.join(__dirname, "三省-方案讲解.pptx");
const GOLD = "F2B632", CYAN = "5BC0FF", CARD = "0E2552", CARDLINE = "2B58A6", TXT = "E6EEFB", MUTED = "9DB2D8", BANNER = "17428F";
const ZHONG = "3B82F6", MEN = "E5533F", SHANG = "34A874", WHITE = "FFFFFF";
const FONT = process.env.DECK_FONT || "Microsoft YaHei";

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10 x 5.625 in
pres.title = "三省：可验证的多智能体编排调度平台";
pres.author = "三省项目组";

let n = 0;
const T = (s, text, o) => s.addText(text, { fontFace: FONT, margin: 0, isTextBox: true, ...o });
const img = (f) => path.join(ASSETS, f);
const shadow = () => ({ type: "outer", color: "000000", opacity: 0.4, blur: 8, offset: 2, angle: 90 });
// "文字{金色强调}文字" -> 带强调色的文字片段
const runs = (str, base = {}, hi = GOLD) =>
  str.split(/(\{[^}]*\})/).filter(Boolean).map((p) =>
    p.startsWith("{") ? { text: p.slice(1, -1), options: { ...base, color: hi, bold: true } } : { text: p, options: base });

function page(tag, title, banner) {
  const s = pres.addSlide();
  n += 1;
  s.background = { path: img("bg.png") };
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.5, y: 0.26, w: 1.35, h: 0.28, fill: { color: GOLD, transparency: 85 }, line: { color: GOLD, width: 1 }, rectRadius: 0.05 });
  T(s, tag, { x: 0.5, y: 0.26, w: 1.35, h: 0.28, fontSize: 11, bold: true, color: GOLD, align: "center", valign: "middle" });
  T(s, title, { x: 0.5, y: 0.6, w: 8.2, h: 0.68, fontSize: 20, bold: true, color: WHITE, valign: "middle" });
  s.addImage({ path: img("logo.png"), x: 9.0, y: 0.25, w: 0.5, h: 0.5 });
  if (banner) {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.5, y: 4.72, w: 9, h: 0.5, fill: { color: BANNER }, line: { color: CYAN, width: 0.75 }, rectRadius: 0.06 });
    T(s, runs(banner, { bold: true, color: WHITE }), { x: 0.7, y: 4.72, w: 8.6, h: 0.5, fontSize: 14, align: "center", valign: "middle" });
  }
  T(s, String(n), { x: 9.0, y: 5.3, w: 0.5, h: 0.2, fontSize: 9, color: MUTED, align: "right", valign: "middle" });
  return s;
}
const shot = (s, file, x, y, w) => {
  const h = w / 1.69; // 截图已裁去顶部导航栏
  s.addShape(pres.shapes.RECTANGLE, { x: x - 0.03, y: y - 0.03, w: w + 0.06, h: h + 0.06, fill: { color: WHITE }, line: { color: CYAN, width: 1 }, shadow: shadow() });
  s.addImage({ path: path.join(ASSETS, "shots", file), x, y, w, h });
  return y + h;
};
const cap = (s, text, x, y, w) => {
  s.addShape(pres.shapes.RECTANGLE, { x, y, w, h: 0.3, fill: { color: BANNER }, line: { color: BANNER, width: 0 } });
  T(s, text, { x, y, w, h: 0.3, fontSize: 11, bold: true, color: WHITE, align: "center", valign: "middle" });
};
const card = (s, x, y, w, h) =>
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: CARD }, line: { color: CARDLINE, width: 1 }, rectRadius: 0.06, shadow: shadow() });
const head = (s, x, y, w, text, color = BANNER) => {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 0.42, fill: { color }, line: { color, width: 0 }, rectRadius: 0.06 });
  T(s, text, { x, y, w, h: 0.42, fontSize: 14, bold: true, color: WHITE, align: "center", valign: "middle" });
};
const num = (s, x, y, d, label, fill = ZHONG) => {
  s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { color: CYAN, width: 1 } });
  T(s, label, { x, y, w: d, h: d, fontSize: d > 0.5 ? 18 : 13, bold: true, color: WHITE, align: "center", valign: "middle" });
};
const box = (s, x, y, w, h, text, color, size = 13) => {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color }, line: { color: WHITE, width: 0.5 }, rectRadius: 0.06 });
  T(s, text, { x, y, w, h, fontSize: size, bold: true, color: WHITE, align: "center", valign: "middle" });
};
const arrow = (s, x1, y1, x2, y2, color = CYAN) =>
  s.addShape(pres.shapes.LINE, {
    x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
    flipH: x2 < x1, flipV: y2 < y1, line: { color, width: 1.75, endArrowType: "triangle" },
  });
const bullets = (items, base = {}) => items.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < items.length - 1, color: TXT, ...base } }));
const big = (s, x, y, w, value, label, color = GOLD) => {
  T(s, value, { x, y, w, h: 0.7, fontSize: 30, bold: true, color, valign: "middle" });
  T(s, label, { x, y: y + 0.7, w, h: 0.45, fontSize: 11, color: MUTED, valign: "top" });
};

// 1 封面
{
  const s = pres.addSlide();
  n += 1;
  s.background = { path: img("cover.png") };
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 0.45, w: 4.6, h: 0.34, fill: { color: GOLD, transparency: 85 }, line: { color: GOLD, width: 1 }, rectRadius: 0.05 });
  T(s, "赛题：大模型 Agent 工具编排调度平台 · 初赛", { x: 0.6, y: 0.45, w: 4.6, h: 0.34, fontSize: 12, bold: true, color: GOLD, align: "center", valign: "middle" });
  T(s, "可验证的多智能体编排调度平台", { x: 0.7, y: 3.45, w: 5.8, h: 0.55, fontSize: 24, bold: true, color: WHITE, valign: "middle" });
  T(s, runs("起草、审核、执行各司其职，{写的人不审，审的人不写}", { color: TXT }), { x: 0.7, y: 4.05, w: 5.8, h: 0.4, fontSize: 14, valign: "middle" });
  ["声明式定义", "动态调度", "独立核查", "有界自循环", "反馈优化"].forEach((t, i) => {
    const x = 0.7 + i * 1.2;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 4.75, w: 1.08, h: 0.36, fill: { color: BANNER }, line: { color: CYAN, width: 0.75 }, rectRadius: 0.05 });
    T(s, t, { x, y: 4.75, w: 1.08, h: 0.36, fontSize: 11, bold: true, color: WHITE, align: "center", valign: "middle" });
  });
  s.addNotes("各位评委好。我们的系统叫三省，名字来自唐代的三省制：中书省起草，门下省审核，尚书省执行，谁写的谁不审。右边三个圆就是这三个角色，它们也是我们系统里的三类 Agent。接下来我用十几分钟讲清楚我们做了什么、怎么做的、效果如何。");
}

// 2 一页讲清
{
  const s = page("项目概览", "三省：让多智能体既跑得快，又让人信得过", "{写的人不审，审的人不写}：起草、审核、执行各司其职");
  const cols = [
    ["痛点", ["同一个模型既写又审，错误一起放过", "检索、阅读、核查串行，动辄十几分钟", "某一步出错，整体崩溃或带错继续"], MEN],
    ["做法", ["独立核查：核查者看不到起草者的推理", "流水线并行：读完一条就核查一条", "有界自循环：先诊断再修复，变好才采纳"], ZHONG],
  ];
  cols.forEach(([h, items, c], i) => {
    const x = 0.5 + i * 3.1;
    card(s, x, 1.4, 2.9, 3.1);
    head(s, x + 0.15, 1.55, 2.6, h, c);
    T(s, bullets(items, { fontSize: 13 }), { x: x + 0.2, y: 2.15, w: 2.5, h: 2.25, fontSize: 13, valign: "top", paraSpaceAfter: 8 });
    if (i === 0) arrow(s, 3.42, 2.95, 3.58, 2.95);
  });
  arrow(s, 6.52, 2.95, 6.68, 2.95);
  card(s, 6.7, 1.4, 2.8, 3.1);
  head(s, 6.85, 1.55, 2.5, "成果（实测）", SHANG);
  [["3.48×", "最高并行加速比（实测 2.95–3.48）"], ["0", "误放行：合成 0/46，真实 0/15"], ["34→51%", "新能源题修复后质量门通过率"]].forEach(([v, l], i) => {
    const y = 2.05 + i * 0.8;
    T(s, v, { x: 6.9, y, w: 2.4, h: 0.42, fontSize: 24, bold: true, color: GOLD, valign: "middle" });
    T(s, l, { x: 6.9, y: y + 0.42, w: 2.45, h: 0.3, fontSize: 10.5, color: MUTED, valign: "top" });
  });
  s.addNotes("这一页讲清楚三件事。左边是三个痛点：同一个模型既写又审，流程串行，出错就整体失败或带错继续。中间是我们的三项做法：独立核查、流水线并行、有界自循环。右边是实测成果：并行加速比最高三点四八倍；核查误放行在合成集和真实网页上都是零；新能源题经一轮修复，质量门通过率从百分之三十四提高到五十一。");
}

// 3 三省定位
{
  const s = page("总体设计", "借三省制立规矩：起草、审核、执行各司其职", "核查者{看不到起草者的推理}，只凭证据判断");
  const cols = [
    ["中书省 · 起草", "规划、检索、阅读、撰写 Agent：拆解题目，生成各章节与结论", ZHONG],
    ["门下省 · 审核封驳", "独立核查 Agent 与质量门：逐条对证据，不合格则封驳", MEN],
    ["尚书省 · 执行调度", "调度器：并行、重试、预算、降级、插入修复任务", SHANG],
  ];
  cols.forEach(([h, body, c], i) => {
    const x = 0.5 + i * 3.075;
    card(s, x, 1.4, 2.6, 2.0);
    head(s, x + 0.12, 1.52, 2.36, h, c);
    T(s, body, { x: x + 0.2, y: 2.1, w: 2.2, h: 1.2, fontSize: 13, color: TXT, valign: "top" });
    if (i < 2) arrow(s, x + 2.65, 2.4, x + 3.05, 2.4);
  });
  T(s, "对应赛题的五项能力", { x: 0.5, y: 3.6, w: 4, h: 0.3, fontSize: 14, bold: true, color: GOLD, valign: "middle" });
  ["声明式定义", "动态调度", "独立核查", "有界自循环", "反馈优化"].forEach((t, i) => box(s, 0.5 + i * 1.82, 4.0, 1.65, 0.5, t, BANNER, 13));
  s.addNotes("三省制里，中书省起草，门下省审核并可以封驳，尚书省负责执行。我们把它对应到系统：规划与撰写的 Agent、独立核查的 Agent，以及负责调度的执行层。核查者看不到起草者的推理，只凭证据判断，这才是真正的审核。下面五项，对应赛题要的编排平台能力。");
}

// 4 总体架构
{
  const s = page("总体设计", "一套引擎、两个应用：声明式编排加自研调度器", "问答与调研报告共用同一套引擎，{运行过程在编排页实时可见}");
  const layers = [
    ["应用层", [["问答 · LangGraph", "检索纠错 · 生成纠错 · 有界循环"], ["调研报告 · 编排流水线", "规划 → 检索 → 阅读 → 核查 → 统稿"]], ZHONG],
    ["编排层", [["声明式定义（YAML）", "知识库 · Agent · 团队 · 工作流 · 策略，运行前先校验"]], "6D5BD0"],
    ["调度层", [["asyncio 自研调度器", "就绪集 · 优先级 · 资源池 · 重试 · 超时 · 预算 · 模型降级 · 运行时插入任务"]], SHANG],
    ["基础设施", [["FastAPI", ""], ["PostgreSQL", ""], ["Qdrant", ""], ["Next.js 15", ""]], "5B6B8C"],
  ];
  layers.forEach(([name, parts, c], i) => {
    const y = 1.35 + i * 0.83;
    box(s, 0.5, y, 1.3, 0.66, name, c, 14);
    const w = (7.5 - (parts.length - 1) * 0.15) / parts.length;
    parts.forEach(([a, b], j) => {
      const x = 2.0 + j * (w + 0.15);
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 0.66, fill: { color: CARD }, line: { color: c, width: 1.25 }, rectRadius: 0.06 });
      T(s, a, { x: x + 0.1, y: y + (b ? 0.04 : 0), w: w - 0.2, h: b ? 0.28 : 0.66, fontSize: 13, bold: true, color: WHITE, align: "center", valign: "middle" });
      if (b) T(s, b, { x: x + 0.1, y: y + 0.32, w: w - 0.2, h: 0.32, fontSize: 10.5, color: MUTED, align: "center", valign: "middle" });
    });
    if (i < 3) arrow(s, 5.75, y + 0.66, 5.75, y + 0.83);
  });
  s.addNotes("架构分四层。最上面是两个应用：问答用 LangGraph 做有界纠错；调研报告走我们的编排流水线。第二层是声明式的编排层，工作流用 YAML 描述，运行前先校验。第三层是自研的调度器，基于 asyncio，负责并行、重试、预算和降级。最下面是数据与基础设施。");
}

// 5 技术路线
{
  const s = page("总体设计", "技术路线：起草、审核、修复、统稿", "质量门未通过才进入修复，{修复结果不比之前差才采纳}");
  const nodes = [["规划", ZHONG], ["检索", ZHONG], ["阅读", ZHONG], ["逐项核查", MEN], ["质量门", MEN], ["统稿披露", SHANG]];
  const w = 1.35, gap = 0.18;
  nodes.forEach(([t, c], i) => {
    const x = 0.5 + i * (w + gap);
    box(s, x, 1.4, w, 0.65, t, c, 14);
    if (i < 5) arrow(s, x + w, 1.72, x + w + gap, 1.72);
  });
  const gateX = 0.5 + 4 * (w + gap) + w / 2, mergeX = 0.5 + 5 * (w + gap) + w / 2;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.5, y: 2.65, w: 9, h: 1.45, fill: { color: CARD }, line: { color: CYAN, width: 1, dashType: "dash" }, rectRadius: 0.08 });
  T(s, "有界自循环（不达标时触发）", { x: 0.7, y: 2.7, w: 4, h: 0.3, fontSize: 13, bold: true, color: GOLD, valign: "middle" });
  [["诊断失败类型", MEN], ["定向修复", ZHONG], ["复核对比", MEN], ["不差才采纳", SHANG]].forEach(([t, c], i) => {
    const x = 0.8 + i * 2.1;
    box(s, x, 3.2, 1.7, 0.6, t, c, 13);
    if (i < 3) arrow(s, x + 1.7, 3.5, x + 2.1, 3.5);
  });
  arrow(s, gateX, 2.05, gateX, 2.65, MEN);
  arrow(s, mergeX, 2.65, mergeX, 2.05, SHANG);
  T(s, "未达标", { x: gateX - 1.1, y: 2.25, w: 1.0, h: 0.3, fontSize: 11, bold: true, color: MEN, align: "right", valign: "middle" });
  T(s, "达标", { x: mergeX + 0.1, y: 2.25, w: 0.8, h: 0.3, fontSize: 11, bold: true, color: SHANG, valign: "middle" });
  s.addNotes("这是一次运行的技术路线。蓝色是中书省：规划、检索、阅读。红色是门下省：逐项核查和质量门。绿色是尚书省：统稿和披露。质量门没通过，就进入下面的有界自循环：诊断失败类型、定向修复、复核对比，只有结果不比修复前差才采纳。通过之后进入统稿，并把不确定的地方如实披露。");
}

// 6 编排与调度
{
  const s = page("关键技术", "流程是数据，运行时可调：声明式编排与动态调度", "依赖成环、引用缺失在启动前拦下；{额度耗尽自动换模型}，不占重试次数");
  const y1 = shot(s, "spec-yaml.png", 0.73, 1.4, 3.9);
  const y2 = shot(s, "orch-live.png", 5.38, 1.4, 3.9);
  cap(s, "声明式编排：五类对象，YAML 定义", 0.73, y1 + 0.08, 3.9);
  cap(s, "动态调度：运行中的任务与时间线", 5.38, y2 + 0.08, 3.9);
  T(s, bullets(["Agent、工作流、策略分开声明", "每个 Agent 可单独指定模型"], { fontSize: 12 }), { x: 0.5, y: y1 + 0.45, w: 4.35, h: 0.5, fontSize: 12, valign: "top" });
  T(s, bullets(["检索池与模型池分别限流，失败重试、超时终止", "预算软硬两道线，运行中可插入修复任务"], { fontSize: 12 }), { x: 5.15, y: y2 + 0.45, w: 4.35, h: 0.5, fontSize: 12, valign: "top" });
  s.addNotes("左边是声明式编排。流程在我们这里是数据，五类对象用 YAML 声明，运行前先校验，依赖成环、引用不存在这类问题在启动之前就会被拦下，每个 Agent 也能单独指定模型。右边是动态调度：依赖满足就启动，检索和模型调用各有并发池，失败重试，超时终止，预算分软硬两道线，额度用完自动换模型，运行中还能向调度器插入新任务，修复循环就是这样实现的。");
}

// 7 流水线并行
{
  const s = page("关键技术", "流水线并行：读完一条就核查一条，加速比达 3.48 倍", "三次真实运行并行加速比 {2.95–3.48 倍}；上游某项失败，对应下游项明确标为失败");
  s.addChart(pres.charts.BAR, [{ name: "并行加速比", labels: ["就业", "收入", "新能源"], values: [3.29, 2.95, 3.48] }], {
    x: 0.5, y: 1.4, w: 3.9, h: 3.1, barDir: "col", chartColors: [GOLD],
    showTitle: true, title: "并行加速比（倍）", titleFontFace: FONT, titleFontSize: 12, titleColor: WHITE,
    showValue: true, dataLabelFontFace: FONT, dataLabelFontSize: 12, dataLabelColor: WHITE, dataLabelFormatCode: "0.00",
    catAxisLabelFontFace: FONT, catAxisLabelFontSize: 12, catAxisLabelColor: TXT,
    valAxisLabelFontFace: FONT, valAxisLabelFontSize: 11, valAxisLabelColor: MUTED, valAxisMinVal: 0, valAxisMaxVal: 4,
    valGridLine: { color: "27437A", size: 0.5 }, catGridLine: { style: "none" }, showLegend: false, barGapWidthPct: 70,
  });
  const y = shot(s, "orch-waterfall.png", 4.9, 1.4, 4.6);
  cap(s, "真实运行的任务时间线：检索与阅读并行，核查紧随其后", 4.9, y + 0.08, 4.6);
  s.addNotes("这是我们重点优化的地方。以前阅读完才统一核查，现在每读完一条就立刻核查，下游每一项只等它对应的上游那一项。左边是三次真实运行的并行加速比，就业、收入、新能源分别是三点二九、二点九五、三点四八倍；右边是真实运行的时间线，可以看到检索和阅读并行铺开、核查紧随其后。上游某项失败时，对应的下游项会被明确标为失败，不会悄悄当作成功。");
}

// 8 独立核查
{
  const s = page("关键技术", "核查者看不到起草者的推理：逐条对证据，分四级如实披露", "合成集误放行 {0/46}，真实网页误放行 {0/15}（改进前 3/17）");
  const y = shot(s, "orch-gate.png", 0.5, 1.4, 4.6);
  cap(s, "质量门的判定与披露（真实界面）", 0.5, y + 0.08, 4.6);
  T(s, "断言分四级", { x: 5.85, y: 1.38, w: 3.6, h: 0.32, fontSize: 14, bold: true, color: GOLD, valign: "middle" });
  [["已核实", SHANG, "多个独立来源一致"], ["单一来源", ZHONG, "仅一处出处"], ["存在争议", "D99A1E", "来源之间矛盾"], ["未核实", "5B6B8C", "找不到支撑"]].forEach(([a, c, b], i) => {
    const yy = 1.8 + i * 0.5;
    box(s, 5.85, yy, 1.15, 0.4, a, c, 12);
    T(s, b, { x: 7.15, y: yy, w: 2.35, h: 0.4, fontSize: 12, color: TXT, valign: "middle" });
  });
  T(s, bullets(["被两次驳回才定为不成立，避免误杀", "数据点必须能在原文逐字找到"], { fontSize: 12 }), { x: 5.85, y: 3.9, w: 3.65, h: 0.7, fontSize: 12, valign: "top", paraSpaceAfter: 4 });
  s.addNotes("这是门下省的部分。核查者能看到的内容里不包含起草者的推理，只看证据。每条断言单独复核，被驳回两次才定为不成立，避免一次误判就推翻。断言最后分成四级：已核实、单一来源、存在争议、未核实，报告里如实披露。所有数据点必须能在原文里逐字找到。");
}

// 9 有界自循环
{
  const s = page("关键技术", "有界自循环：先诊断再修复，只在确实变好时才采纳", "停止条件：没有进展、达到最大轮次、用掉 {60%} 预算，任一即停");
  const bx = [[0.7, 1.45], [2.9, 1.45], [2.9, 3.25], [0.7, 3.25]];
  [["质量门", MEN], ["诊断失败类型", MEN], ["定向修复", ZHONG], ["复核对比", MEN]].forEach(([t, c], i) => box(s, bx[i][0], bx[i][1], 1.8, 0.8, t, c, 14));
  arrow(s, 2.5, 1.85, 2.9, 1.85);
  arrow(s, 3.8, 2.25, 3.8, 3.25);
  arrow(s, 2.9, 3.65, 2.5, 3.65);
  arrow(s, 1.6, 3.25, 1.6, 2.25);
  T(s, "最多若干轮", { x: 1.55, y: 2.5, w: 2.3, h: 0.4, fontSize: 12, color: MUTED, align: "center", valign: "middle" });
  [["34%→51%", "新能源题质量门通过率，一轮修复后"], ["5 次改写", "4 次被驳回，1 次被采纳"], ["0 轮修复", "就业、收入两题首轮即达标，不白花调用"]].forEach(([b, lab], i) => {
    const yy = 1.4 + i * 1.07;
    card(s, 5.4, yy, 4.1, 0.95);
    T(s, b, { x: 5.6, y: yy, w: 1.8, h: 0.95, fontSize: 22, bold: true, color: GOLD, valign: "middle" });
    T(s, lab, { x: 7.45, y: yy, w: 1.95, h: 0.95, fontSize: 12, color: TXT, valign: "middle" });
  });
  s.addNotes("自纠错必须有界。质量门不过关，先诊断失败类型，再做定向修复，复核后只有结果不比之前差才采纳。停止条件有三个：没有进展、达到最大轮次、预算用到六成。真实运行里，新能源这一题通过率从百分之三十四提高到五十一，五次改写里四次被驳回、一次被采纳。就业和收入两题首轮就达标，系统不会白白多花调用。");
}

// 10 问答
{
  const s = page("应用展示", "问答：每个结论都能追溯到证据与来源", "完整方案在 13 个场景上召回@5 为 {1.0}，纠错基线为 {0.8}");
  const y = shot(s, "chat-answer.png", 0.5, 1.4, 4.6);
  cap(s, "回答带引用，点开即见证据与来源（真实界面）", 0.5, y + 0.08, 4.6);
  [["检索", "Dense + BM25 + RRF + 重排"], ["纠错", "先诊断失败类型，再纠错，轮次有上限"], ["追溯", "结论 → 证据 → 来源，逐层可点开"]].forEach(([a, b], i) => {
    const yy = 1.4 + i * 1.07;
    card(s, 5.85, yy, 3.65, 0.95);
    num(s, 6.0, yy + 0.2, 0.55, String(i + 1), i === 1 ? MEN : ZHONG);
    T(s, a, { x: 6.7, y: yy + 0.08, w: 2.7, h: 0.35, fontSize: 14, bold: true, color: GOLD, valign: "middle" });
    T(s, b, { x: 6.7, y: yy + 0.43, w: 2.7, h: 0.45, fontSize: 11.5, color: TXT, valign: "top" });
  });
  s.addNotes("问答模块用 LangGraph 做状态和条件路由。检索用稠密加关键词加融合再加重排。回答不是一段文字，而是结论到证据到来源可以逐层追溯。纠错过程可以在界面里展开，轮次有上限。P5 评测里，完整方案在十三个场景上召回为一，只做纠错的基线是零点八。");
}

// 11 调研报告
{
  const s = page("应用展示", "调研报告：图表、框架图与时间线由数据生成，随文导出", "同一引擎产出成稿，{PDF / Word 导出}，图随正文走");
  const y1 = shot(s, "report-diagrams.png", 0.73, 1.4, 3.9);
  const y2 = shot(s, "report-chart.png", 5.38, 1.4, 3.9);
  cap(s, "框架图与关键时间线", 0.73, y1 + 0.08, 3.9);
  cap(s, "数据图表与逐条引用", 5.38, y2 + 0.08, 3.9);
  T(s, bullets(["折线、柱状、饼图由数据生成，不是编的", "运行过程同步显示在编排页"], { fontSize: 12 }), { x: 0.5, y: y1 + 0.45, w: 9, h: 0.5, fontSize: 12, valign: "top" });
  s.addNotes("调研报告模块跑的是同一套引擎。图表由数据生成，不是编的：折线、柱状、饼图，加上自动绘制的框架图和时间线。左边是框架图和关键时间线，右边是数据图表和逐条引用。报告可以导出 PDF 和 Word，图随正文一起走，运行过程同步显示在编排页。");
}

// 12 实验
{
  const s = page("实验结果", "实测数据说话：核查误放行为零，487 项后端测试通过", "指标由评测脚本生成；{样本量有限}，置信区间已在方案书中给出");
  const H = (t) => ({ text: t, options: { bold: true, color: WHITE, fill: { color: BANNER }, fontFace: FONT, fontSize: 12, align: "center", valign: "middle" } });
  const C = (t, o = {}) => ({ text: t, options: { fontFace: FONT, fontSize: 12, color: TXT, fill: { color: CARD }, align: "center", valign: "middle", ...o } });
  const G = (t) => C(t, { color: GOLD, bold: true });
  s.addTable([
    [H("核查评测"), H("样本"), H("等级准确率"), H("误放行"), H("抽取召回")],
    [C("合成集", { align: "left", bold: true }), C("48 例 / 100 断言"), G("97.7%"), G("0 / 46"), C("88%")],
    [C("真实网页", { align: "left", bold: true }), C("28 例 / 60 断言"), G("100%（n=46）"), G("0 / 15"), C("76.7%")],
  ], { x: 0.5, y: 1.4, w: 9, colW: [1.8, 2.1, 1.9, 1.5, 1.7], rowH: 0.42, border: { type: "solid", pt: 0.5, color: CARDLINE } });
  [["487", "后端测试通过\n（另有 4 项跳过）"], ["18", "端到端界面\n测试用例"], ["3 / 17", "真实网页上改进前\n的误放行"], ["13 场景", "P5：完整方案召回 1.0\n纠错基线 0.8"]].forEach(([b, lab], i) => {
    const x = 0.5 + i * 2.28;
    card(s, x, 2.9, 2.1, 1.6);
    T(s, b, { x: x + 0.1, y: 3.0, w: 1.9, h: 0.7, fontSize: 26, bold: true, color: GOLD, align: "center", valign: "middle" });
    T(s, lab, { x: x + 0.1, y: 3.7, w: 1.9, h: 0.7, fontSize: 11, color: MUTED, align: "center", valign: "top" });
  });
  s.addNotes("评测数据全部由脚本生成。核查评测分合成集和真实网页两组：合成集一百条断言，等级准确率百分之九十七点七，误放行零；真实网页六十条断言，误放行零，改进之前这一项是十七条里放过三条。抽取召回在七十七到八十八之间，这是我们承认的短板。另外，后端四百八十七项测试通过，十八个界面端到端用例，P5 的十三个场景里，完整方案召回为一，纠错基线为零点八。");
}

// 13 创新点
{
  const s = page("创新与展望", "四项创新：分权、并行、有界、可回放", "把可信做成{平台的内建能力}，而不是事后检查");
  [
    ["起草与审核分权", "核查者看不到起草者的推理，只凭证据判断：写的人不审，审的人不写。"],
    ["流水线逐项并行", "每读完一条就核查一条，三次真实运行并行加速比 2.95 至 3.48 倍。"],
    ["有界自循环", "先诊断再修复，只在结果不比之前差时采纳，设有三重停止条件。"],
    ["声明式且可回放", "流程用 YAML 声明、运行前校验，每一步事件可回放、可度量。"],
  ].forEach(([h, body], i) => {
    const x = 0.5 + (i % 2) * 4.6, y = 1.4 + Math.floor(i / 2) * 1.67;
    card(s, x, y, 4.4, 1.5);
    num(s, x + 0.2, y + 0.25, 0.65, String(i + 1), i % 2 ? ZHONG : MEN);
    T(s, h, { x: x + 1.05, y: y + 0.15, w: 3.2, h: 0.4, fontSize: 16, bold: true, color: GOLD, valign: "middle" });
    T(s, body, { x: x + 1.05, y: y + 0.6, w: 3.2, h: 0.8, fontSize: 12, color: TXT, valign: "top" });
  });
  s.addNotes("总结四个创新点。一，起草与审核分权，核查者看不到起草者的推理。二，流水线逐项并行，加速比接近三倍。三，有界自循环，先诊断再修复，只在变好时采纳。四，声明式定义加运行回放，每一步都可度量。");
}

// 14 不足与展望
{
  const s = page("创新与展望", "如实面对不足，逐项推进", "不足已写入方案书局限章节，{不回避、不夸大}");
  const rows = [
    ["样本量有限，置信区间较宽", "扩大真实网页评测集"],
    ["只接入单一模型", "接入更多模型并横向对比"],
    ["没有断点续跑", "运行断点续跑"],
    ["没有拖拽式编排器", "拖拽式流程搭建"],
    ["反馈优化目前只给建议", "从建议走向自动调参"],
  ];
  T(s, "目前的不足", { x: 0.5, y: 1.35, w: 4.2, h: 0.3, fontSize: 14, bold: true, color: MEN, valign: "middle" });
  T(s, "下一步", { x: 5.3, y: 1.35, w: 4.2, h: 0.3, fontSize: 14, bold: true, color: SHANG, valign: "middle" });
  rows.forEach(([a, b], i) => {
    const y = 1.75 + i * 0.58;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.5, y, w: 4.2, h: 0.46, fill: { color: "3A1A24" }, line: { color: MEN, width: 1 }, rectRadius: 0.05 });
    T(s, a, { x: 0.5, y, w: 4.2, h: 0.46, fontSize: 12, bold: true, color: WHITE, align: "center", valign: "middle" });
    arrow(s, 4.75, y + 0.23, 5.25, y + 0.23);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 5.3, y, w: 4.2, h: 0.46, fill: { color: "123A2E" }, line: { color: SHANG, width: 1 }, rectRadius: 0.05 });
    T(s, b, { x: 5.3, y, w: 4.2, h: 0.46, fontSize: 12, bold: true, color: WHITE, align: "center", valign: "middle" });
  });
  s.addNotes("我们不回避不足。样本量有限、只接入了一个模型、没有断点续跑、也没有拖拽式编排器，反馈优化目前只给建议，抽取召回也还不够高。这些都写进了方案书的局限章节，下一步我们按右边这张清单逐项推进。");
}

// 15 致谢
{
  const s = pres.addSlide();
  n += 1;
  s.background = { path: img("thanks.png") };
  T(s, "感谢聆听", { x: 0.7, y: 1.6, w: 5.8, h: 1.1, fontSize: 52, bold: true, color: GOLD, valign: "middle" });
  T(s, "恳请各位评委批评指正", { x: 0.7, y: 2.8, w: 5.8, h: 0.5, fontSize: 20, color: WHITE, valign: "middle" });
  T(s, "三省 · 写的人不审，审的人不写", { x: 0.7, y: 4.6, w: 5.8, h: 0.4, fontSize: 14, color: MUTED, valign: "middle" });
  s.addNotes("我的汇报就到这里。三省的核心就一句话：写的人不审，审的人不写。谢谢各位评委，恳请批评指正。");
}

pres.writeFile({ fileName: OUT }).then((f) => console.log("written", f));
