import { test as setup, expect } from "@playwright/test";
import path from "path";

const authFile = path.join(__dirname, "../.playwright/.auth/user.json");

/**
 * Signs in once through the real login form and saves the session for the other specs.
 * Needs an ADMIN account: TEST_USER_EMAIL / TEST_USER_PASSWORD (the knowledge-base and admin
 * specs use admin-only pages).
 */
setup("authenticate", async ({ page }) => {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  if (!email || !password) throw new Error("请设置 TEST_USER_EMAIL 和 TEST_USER_PASSWORD（管理员账号）");

  // Make sure the demo auto-login (if enabled in .env.local) cannot hide a broken login form.
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: /登录/ }).click();
  await expect(page).toHaveURL(/\/chat/, { timeout: 15000 });

  await page.context().storageState({ path: authFile });
});
