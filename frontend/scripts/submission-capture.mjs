// Screenshots for the competition proposal and deck (1920x1080 CSS px at 2x, system Chrome via Playwright).
// Runs against the mock backend that serves the saved real runs (backend/scripts/orch_mock_server.py), whose
// POST /runs replays a real run faster than real time so the live state can be captured too.
// Usage: node scripts/submission-capture.mjs <outDir> [baseUrl]
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const [outDir, base = "http://localhost:3100"] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, colorScheme: "light" });
await ctx.addCookies([{ name: "access_token", value: "mock", url: base }]);
await ctx.addInitScript(() => {
  const hide = () => {
    const s = document.createElement("style");
    s.textContent = "nextjs-portal{display:none!important}";
    document.head.appendChild(s);
  };
  if (document.head) hide();
  else document.addEventListener("DOMContentLoaded", hide);
});
const page = await ctx.newPage();

const shot = async (name, wait = 1000) => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: path.join(outDir, name) });
  console.log("shot", name);
};
const open = async () => {
  await page.goto(`${base}/orchestration`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
};
const pickRun = async (pattern) => {
  await page.locator("aside li button.w-full", { hasText: pattern }).first().click();
  await page.waitForTimeout(1500);
};

// 1. workflow definition: the graph and its team
await open();
await page.getByRole("button", { name: /工作流定义/ }).click();
await shot("spec-graph.png", 1500);

// 2. YAML editing: letting the verifier read the writer's reasoning is rejected at import
await page.getByRole("button", { name: "YAML", exact: true }).click();
const yaml = page.getByLabel("工作流定义（YAML）");
const text = await yaml.inputValue();
await yaml.fill(text.replace("can_see: [draft, evidence]", "can_see: [draft, reasoning]"));
await page.getByRole("button", { name: "校验", exact: true }).click();
await page.waitForTimeout(800);
await page.evaluate(() => {
  const ta = document.querySelector("textarea");
  const i = ta.value.indexOf("can_see: [draft, reasoning]");
  ta.scrollTop = Math.max(0, (ta.value.slice(0, i).split("\n").length - 8) * 19.5);
});
await shot("spec-yaml-reject.png");

// 3. the about popover: why the product is called 三省
await open();
await page.getByRole("button", { name: /的由来/ }).first().click();
await shot("about.png");
await page.keyboard.press("Escape");

// 4. new run dialog, then start a run and catch it mid-flight (the mock replays a real run)
await open();
await page.getByRole("button", { name: "新建运行" }).first().click();
await page.waitForTimeout(600);
const topic = page.getByRole("dialog").locator("textarea, input[type=text]").first();
await topic.fill("2025年中国新能源汽车销量与渗透率情况");
await shot("new-run.png");
await page.getByRole("button", { name: "开始运行" }).click();
await page.waitForTimeout(22000);
await shot("run-live.png", 0);

// 5. a finished run: canvas, metrics strip, scheduling timeline
await open();
await pickRun(/verified-report · 9 分/);
await shot("run-done.png");

// 6. node inspector on the independent verifier
await page.locator(".react-flow__node", { hasText: "verify" }).first().click();
await shot("inspector.png");
await page.locator(".react-flow__pane").first().click({ position: { x: 40, y: 40 } });

// 7. quality gate: first check, then the re-check with this round's repair outcomes
await page.getByRole("button", { name: /质量门与自循环/ }).click();
await page.getByRole("button", { name: "放大" }).click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: /首次检查/ }).click();
await shot("gate-first.png");
await page.getByRole("button", { name: /修复后复查/ }).click();
await shot("gate-after.png");
await page.getByRole("button", { name: /事件日志/ }).click();
await shot("event-log.png");

// 8. the report as a reading page
await page.getByRole("button", { name: "报告", exact: true }).click();
await page.waitForTimeout(1500);
await shot("report-top.png");
await page.getByRole("button", { name: "综合研判与行动建议" }).first().click();
await shot("report-synthesis.png", 1800);

// 9. second scenario: fact check
await open();
await pickRun(/fact-check ·/);
await page.getByRole("button", { name: "核查结果", exact: true }).click();
await shot("fact-check.png", 1500);

// 10. feedback → improvement hints
await open();
await page.getByRole("button", { name: /改进建议/ }).click();
await page.waitForTimeout(1500);
await shot("insights.png");

await browser.close();
