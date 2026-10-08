import { test, expect } from "@playwright/test";

test.describe("公开首页", () => {
  test("展示标题、主入口和评测指标", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("自纠错 RAG Agent");
    await expect(page.getByRole("link", { name: /进入对话/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "登录" })).toBeVisible();
    await expect(page.locator("#evaluation")).toContainText("Recall@5");
  });

  test("切换样例会更新回答", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Orion/ }).click();
    await expect(page.getByText("ORION-RECOVER-17").first()).toBeVisible();
  });

  test("移动端可用", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    await expect(page.getByRole("main")).toBeVisible();
  });
});

test.describe("鉴权重定向", () => {
  test("未登录访问 /chat 会跳转到登录页", async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto("/chat");
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });
});
