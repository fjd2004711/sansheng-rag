import { test, expect } from "@playwright/test";

const NAME = `e2e-${Date.now()}.md`;

test("知识库：上传 → 入库 → 检索验证 → 删除", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("/rag");
  await expect(page.getByRole("heading", { name: "知识库" })).toBeVisible();
  await expect(page.getByText("对话正在使用这个资料集")).toBeVisible({ timeout: 20_000 });

  await page.locator('input[type="file"]').setInputFiles({
    name: NAME,
    mimeType: "text/markdown",
    buffer: Buffer.from("# E2E 测试资料\n\n测试专用口令是 ZEBRA-QUARTZ-4417，仅用于自动化测试。\n"),
  });
  const row = page.locator("tr", { hasText: NAME });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row.getByText("已入库")).toBeVisible({ timeout: 90_000 });

  await page.getByRole("tab", { name: "检索验证" }).click();
  await page.getByPlaceholder(/退休手续要提前/).fill("ZEBRA-QUARTZ-4417");
  await page.keyboard.press("Enter");
  await expect(page.getByText(NAME).first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole("tab", { name: "文件" }).click();
  await row.getByTitle("删除").click();
  await page.getByRole("button", { name: "删除", exact: true }).last().click();
  await expect(row).toBeHidden({ timeout: 20_000 });
});

test("评测页：先给结论并说明样本量", async ({ page }) => {
  await page.goto("/evaluation");
  await expect(page.getByRole("heading", { name: "一眼看结论" })).toBeVisible();
  await expect(page.getByText(/只有 3 道专门设计的难题/)).toBeVisible();
});
