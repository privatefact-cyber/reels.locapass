import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./health-checks",
  timeout: 30_000,
  retries: 1,
  globalSetup: "./health-checks/global-setup.ts",
  reporter: [["list"], ["html", { open: "never", outputFolder: "health-checks-report" }]],
  use: {
    baseURL: process.env.HEALTH_CHECK_BASE_URL ?? "https://reels.locapass.net",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    storageState: process.env.HEALTH_CHECK_PASSCODE ? "health-checks/.auth/gate.json" : undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
