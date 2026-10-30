// Capture 1920x1080 screenshots of the orchestration platform for the demo video (system Chrome via Playwright).
// Runs against a backend that serves the saved real runs (backend/scripts/orch_mock_server.py) or the real one.
// Usage: node scripts/demo-capture.mjs <outDir> [baseUrl]   (SCHEME=dark for the dark theme)
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const [outDir, base = "http://localhost:3100"] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, colorScheme: process.env.SCHEME ?? "light" });
await ctx.addCookies([{ name: "access_token", value: process.env.TOKEN ?? "mock", url: base }]);
const page = await ctx.newPage();

const shot = async (name) => {
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(outDir, name) });
  console.log("shot", name);
};
const open = async () => {
  await page.goto(`${base}/orchestration`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
};
const pickRun = async (pattern) => {
  await page.locator("aside li button.w-full", { hasText: pattern }).first().click();
  await page.waitForTimeout(1200);
};
const scrollIn = async (selector, fn) => page.locator(selector).first().evaluate(fn);

// 1. definitions: the workflow as a graph + its team
await open();
await page.getByRole("button", { name: /工作流定义/ }).click();
await page.waitForTimeout(1200);
await shot("04_specs.png");

// 2. a finished report run: canvas, live-style status, scheduling waterfall
await open();
await pickRun(/2025届[\s\S]*verified-report ·/);
await shot("05a_run_top.png");

// 3. click a node: the floating inspector
await page.locator(".react-flow__node", { hasText: "verify" }).first().click();
await shot("05b_node.png");
await page.locator(".react-flow__pane").first().click({ position: { x: 40, y: 40 } });

// 4. quality gate and the self-loop: maximise the dock, then scroll to the repair results
await page.getByRole("button", { name: /质量门与自循环/ }).click();
await page.getByRole("button", { name: "放大" }).click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: /首次检查/ }).click();
await shot("06_gate.png");
await scrollIn("section.bg-card.flex-col div.overflow-auto", (el) => el.scrollBy(0, 300));
await shot("06b_repairs.png");

// 5. the report as a reading page
await page.getByRole("button", { name: "报告", exact: true }).click();
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "核心结论" }).first().click();
await shot("07_report.png");
await page.getByRole("button", { name: "综合研判与行动建议" }).click();
await page.waitForTimeout(1800);
await shot("07_synthesis.png");
await scrollIn("div.overflow-y-auto.scroll-smooth", (el) => el.scrollBy({ top: 760, behavior: "instant" }));
await page.waitForTimeout(800);
await shot("07b_advice.png");

// 6. fact-check scenario
await open();
await pickRun(/fact-check ·/);
await page.getByRole("button", { name: "核查结果", exact: true }).click();
await shot("08_factcheck.png");

// 7. insights
await open();
await page.getByRole("button", { name: /改进建议/ }).click();
await page.waitForSelector("text=建议怎么改");
await shot("08b_insights.png");

// 8. new-run dialog
await open();
await page.getByRole("button", { name: "新建运行" }).first().click();
await shot("08c_new_run.png");

await browser.close();
