import { test, expect } from "@playwright/test";

test.describe("登录与注册", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("登录页展示表单", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "登录" })).toBeVisible();
    await expect(page.getByLabel("邮箱")).toBeVisible();
    await expect(page.getByLabel("密码")).toBeVisible();
  });

  test("可以从登录页进入注册页", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "注册" }).click();
    await expect(page.getByRole("heading", { name: "创建账户" })).toBeVisible();
  });

  test("注册时两次密码不一致会提示", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("邮箱").fill("user@example.com");
    await page.getByLabel("密码", { exact: true }).fill("password-1234");
    await page.getByLabel("确认密码").fill("password-5678");
    await page.getByRole("button", { name: "创建账户" }).click();
    await expect(page.getByText("两次密码不一致").first()).toBeVisible();
  });

  test("错误凭证登录失败并留在登录页", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("邮箱").fill("nobody@example.com");
    await page.getByLabel("密码").fill("wrong-password");
    await page.getByRole("button", { name: /登录/ }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
