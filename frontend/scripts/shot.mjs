// Dev helper: screenshot a page of the running dev server with a fake session cookie (the mock backend accepts any).
// Usage: node scripts/shot.mjs <outFile> [path] [width] [height] [steps-json]
import { chromium } from "playwright-core";

const [out, path = "/orchestration", w = "1600", h = "950", stepsJson = "[]"] = process.argv.slice(2);
const steps = JSON.parse(stepsJson);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, colorScheme: process.env.SCHEME ?? "light" });
await ctx.addCookies([{ name: "access_token", value: "mock", url: "http://localhost:3100" }]);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 200)));
page.on("console", (m) => m.type() === "error" && console.log("CONSOLE", m.text().slice(0, 200)));
await page.goto(`http://localhost:3100${path}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
for (const s of steps) {
  if (s.click) await page.getByText(s.click, { exact: s.exact ?? false }).first().click();
  if (s.clickRole) await page.getByRole(s.clickRole, { name: s.name }).first().click();
  if (s.wait) await page.waitForTimeout(s.wait);
}
await page.screenshot({ path: out });
console.log("saved", out);
await browser.close();
