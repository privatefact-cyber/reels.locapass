import { test, expect } from "@playwright/test";

// 主要な公開ページが200で開けることだけを確認する死活監視。
const MAIN_PAGES = [
  "/",
  "/events",
  "/shops/28139d9e-ffb8-4c30-b4f6-ce4ed8428e46",
  "/login",
  "/mypage/login",
  "/cast/login",
  "/staff/login",
  "/admin/login",
];

for (const path of MAIN_PAGES) {
  test(`GET ${path} is reachable`, async ({ page }) => {
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response, `${path} returned no response`).not.toBeNull();
    expect(response!.status(), `${path} returned ${response!.status()}`).toBeLessThan(400);
    // Next.jsのエラー画面(500)はステータス200で返ってくることがあるため文言でも確認する。
    await expect(page.locator("body")).not.toContainText("Application error");
  });
}
