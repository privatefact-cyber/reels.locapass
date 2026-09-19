import { chromium, type FullConfig } from "@playwright/test";

// サイト全体が合言葉ゲート(/gate)で覆われているため、各テストの前に一度だけ
// パスコードを送信して認証Cookieを取得し、storageStateとして全テストで使い回す。
async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? "https://reels.locapass.net";
  const passcode = process.env.HEALTH_CHECK_PASSCODE;
  if (!passcode) return;

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(new URL("/gate", baseURL).toString());
  await page.locator('input[name="passcode"]').fill(passcode);
  await page.getByRole("button", { name: "ENTER" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/gate"), { timeout: 15_000 });

  await page.context().storageState({ path: "health-checks/.auth/gate.json" });
  await browser.close();
}

export default globalSetup;
