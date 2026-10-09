import { test, expect } from "@playwright/test";

const NAME = `e2e-${Date.now()}.md`;

test("知识库：我的资料 上传 → 入库 → 删除", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("/rag");
  await expect(page.getByRole("heading", { name: "知识库" })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: NAME,
    mimeType: "text/markdown",
    buffer: Buffer.from("# E2E 测试资料\n\n测试专用口令是 ZEBRA-QUARTZ-4417，仅用于自动化测试。\n"),
  });
  const row = page.locator("tr", { hasText: NAME });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row.getByText("已入库")).toBeVisible({ timeout: 90_000 });

  await row.getByTitle("删除").click();
  await page.getByRole("button", { name: "删除", exact: true }).last().click();
  await expect(row).toBeHidden({ timeout: 20_000 });
});

test("共享资料：普通用户只读（管理员看到管理界面）", async ({ page }) => {
  await page.goto("/rag");
  await page.getByRole("tab", { name: /共享资料/ }).click();
  await expect(page.getByText(/只能查看|新建资料集/).first()).toBeVisible({ timeout: 20_000 });
});

test("质量页：按真实使用统计，没有记录时给出引导", async ({ page }) => {
  await page.goto("/evaluation");
  await expect(page.getByRole("heading", { name: "回答质量" })).toBeVisible();
  await expect(page.getByText(/条回答的核对结果|这段时间还没有记录/)).toBeVisible({ timeout: 20_000 });
});
