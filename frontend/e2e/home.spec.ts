import { test, expect } from "@playwright/test";

test.describe("入口", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  // With DEMO_LOGIN_* configured the site signs visitors in automatically, so these cannot apply.
  test.skip(process.env.E2E_DEMO_LOGIN === "1", "演示自动登录已开启");

  test("首页没有启动页，未登录时落到登录页", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "登录" })).toBeVisible();
  });

  test("未登录访问对话页会跳转到登录页", async ({ page }) => {
    await page.goto("/chat");
    await expect(page).toHaveURL(/\/login/);
  });

  test("移动端可用", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/login");
    await expect(page.getByRole("main")).toBeVisible();
  });
});
