import { test, expect } from "@playwright/test";

const EMAIL = `e2e-${Date.now()}@example.com`;

test("管理：创建账号 → 设为管理员 → 停用 → 删除", async ({ page }) => {
  await page.goto("/admin");
  await page.getByRole("tab", { name: "账号" }).click();
  await page.getByRole("button", { name: "创建账号" }).click();
  await page.getByLabel("邮箱").fill(EMAIL);
  await page.getByLabel(/初始密码/).fill("E2e-Test-Pass-77");
  await page.getByRole("button", { name: "创建", exact: true }).click();

  const row = page.locator("tr", { hasText: EMAIL });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "设为管理员" }).click();
  await expect(row.getByText("管理员", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "停用" }).click();
  await expect(row.getByText("已停用")).toBeVisible();
  await row.getByRole("button", { name: "删除" }).click();
  await page.getByRole("button", { name: "删除", exact: true }).last().click();
  await expect(row).toBeHidden();
});

test("管理：用户反馈列表可见", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByText(/共 \d+ 条反馈/)).toBeVisible();
});
