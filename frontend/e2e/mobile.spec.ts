import { test, expect } from "@playwright/test";

test("手机：对话页可用，能打开历史对话", async ({ page }) => {
  await page.goto("/chat");
  await expect(page.getByLabel("输入你的问题")).toBeVisible();
  await page.getByRole("button", { name: "历史对话" }).click();
  // The drawer's button; the desktop sidebar has one too but is hidden on phones.
  await expect(page.getByText("会话列表").filter({ visible: true }).first()).toBeVisible();
});

test("手机：知识库与评测页不横向溢出", async ({ page }) => {
  for (const path of ["/rag", "/evaluation"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} 横向溢出 ${overflow}px`).toBeLessThanOrEqual(1);
  }
});
