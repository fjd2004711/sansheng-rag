// Capture 1920x1080 screenshots of the orchestration page for the demo video (system Chrome via Playwright).
// Usage: node frontend/scripts/demo-capture.mjs <outDir> <reportRunId> <factCheckRunId> [baseUrl]
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const [outDir, reportRun, factRun, base = "http://localhost:3100"] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const toHeading = async (page, name) => {
  const h = page.getByRole("heading", { name, exact: true }).first();
  await h.waitFor();
  await h.evaluate((el) => el.scrollIntoView({ block: "start" }));
};
const shot = async (page, name) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(outDir, name) });
  console.log("shot", name);
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(`${base}/login`);
await page.getByLabel("邮箱").fill("e2e@example.com");
await page.getByLabel("密码").fill("E2e-test-pass-1");
await page.keyboard.press("Enter");
await page.waitForURL(/\/(chat|orchestration|rag|reports)/, { timeout: 30000 });

const pick = async (id) => {
  // Runs are listed by topic; select by id through the data we know: click the Nth matching entry.
  await page.goto(`${base}/orchestration`);
  await page.waitForSelector("text=开始运行");
  return page;
};

// 1. definitions page
await page.goto(`${base}/orchestration`);
await page.getByRole("tab", { name: "团队与工作流定义" }).click();
await page.waitForSelector("text=独立核查");
await shot(page, "04_specs.png");

// 2. a finished report run: header + graph + timeline
await pick(reportRun);
const topic = process.env.REPORT_TOPIC ?? "2025届";
const finished = new RegExp(`${topic}[\\s\\S]*verified-report · 完成`);
await page.locator("aside ul li button.min-w-0", { hasText: finished }).first().click();
await page.waitForSelector("text=调度时间线");
await page.waitForSelector("text=并行加速");
await shot(page, "05a_run_top.png");
await toHeading(page, "质量门与自循环");
await shot(page, "06_gate.png");

// 3. the report: conclusion, judgment, recommendations
await toHeading(page, "综合研判");
await shot(page, "07_synthesis.png");
await toHeading(page, "行动建议");
await shot(page, "07b_advice.png");

// 4. fact-check run
await pick(factRun);
await page.locator("aside ul li button.min-w-0", { hasText: "fact-check" }).first().click();
await page.waitForSelector("text=逐条核查结果");
await toHeading(page, "逐条核查结果");
await shot(page, "08_factcheck.png");

// 5. insights
await page.goto(`${base}/orchestration`);
await page.getByRole("tab", { name: "改进建议" }).click();
await page.waitForSelector("text=建议怎么改");
await shot(page, "08b_insights.png");

await browser.close();
