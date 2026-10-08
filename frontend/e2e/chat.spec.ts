import { test, expect } from "@playwright/test";

const VERDICT = /已核对|纠错后通过|仅部分有依据|没有找到答案/;

test.describe("对话", () => {
  test("空状态：示例问题、能做/不能做的说明、资料库入口", async ({ page }) => {
    await page.goto("/chat");
    await expect(page.getByRole("button", { name: /返聘教师每周最多/ })).toBeVisible();
    await expect(page.getByText("不能回答资料以外的内容")).toBeVisible();
    await expect(page.getByText(/回答依据：\d+ 份资料/)).toBeVisible();
    await expect(page.getByText("运作流程")).toBeVisible();
  });

  test("输入法组词时回车不会发送", async ({ page }) => {
    await page.goto("/chat");
    const box = page.getByLabel("输入你的问题");
    await box.fill("退休");
    // The Enter that confirms a pinyin candidate arrives flagged as composing (keyCode 229).
    await box.evaluate((el) =>
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, isComposing: true, bubbles: true, cancelable: true })),
    );
    await expect(box).toHaveValue("退休");
    await expect(page.getByText("正在检索资料")).toHaveCount(0);
    // A normal Enter afterwards does send, and clears the box.
    await box.press("Enter");
    await expect(box).toHaveValue("");
  });

  test("提问 → 核对结论 → 详细过程 → 追问建议 → 反馈，刷新后仍在", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/chat");
    await page.getByRole("button", { name: /超课时津贴每节多少钱/ }).click();

    // The answer text only appears after verification; a progress line is shown meanwhile.
    await expect(page.getByText(/正在(检索资料|判断|撰写|核对|换个问法)/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(VERDICT).first()).toBeVisible({ timeout: 180_000 });

    await page.getByRole("button", { name: "搜了什么、为什么" }).first().click();
    const drawer = page.getByText("详细运作过程");
    await expect(drawer).toBeVisible();
    await expect(page.getByText("一句话总结")).toBeVisible();
    await expect(page.getByText("搜索词").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();

    await page.getByRole("button", { name: "有问题" }).click();
    await page.getByRole("button", { name: "答错了" }).click();
    await page.getByPlaceholder(/补充说明/).fill("e2e 自动测试反馈");
    await page.getByRole("button", { name: "提交" }).click();
    await expect(page.getByText("你反馈了这个回答有问题")).toBeVisible();

    await page.reload();
    await expect(page.getByText("你反馈了这个回答有问题")).toBeVisible({ timeout: 20_000 });
    // The operation flow is saved with the answer too.
    await expect(page.locator(".react-flow__node").first()).toBeVisible({ timeout: 20_000 });
  });
});
