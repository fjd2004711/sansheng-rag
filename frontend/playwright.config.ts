
import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E test configuration.
 *
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./e2e",
  /* Run tests in files in parallel */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report" }],
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3010",

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",

    /* Capture screenshot on failure */
    screenshot: "only-on-failure",

    /* Video recording on failure */
    video: "on-first-retry",
  },

  /* Chrome (the installed browser; set PW_CHANNEL=chrome) plus a phone viewport for the smoke test. */
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/, use: { channel: process.env.PW_CHANNEL || undefined } },
    {
      name: "chromium",
      testIgnore: /mobile\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL || undefined, storageState: ".playwright/.auth/user.json" },
      dependencies: ["setup"],
    },
    {
      name: "mobile",
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices["Pixel 5"], channel: process.env.PW_CHANNEL || undefined, storageState: ".playwright/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3010",
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
      },
});
