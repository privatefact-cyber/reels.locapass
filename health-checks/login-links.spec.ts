import { test, expect } from "@playwright/test";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (required for health-checks/login-links.spec.ts)`);
  return value;
}

// ダミーキャスト「ヘルスチェック用テストキャスト」(店舗ステータス inactive、公開ページには出ない)。
test("cast ID/password login reaches mypage", async ({ page }) => {
  const email = requireEnv("HEALTH_CHECK_CAST_EMAIL");
  const password = requireEnv("HEALTH_CHECK_CAST_PASSWORD");

  await page.goto("/cast/login");
  await page.locator('input[type="text"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();

  await page.waitForURL("**/cast/mypage", { timeout: 15_000 });
  await expect(page.locator("h1")).toContainText("ヘルスチェック用テストキャスト");
});

// ダミーキャスト「ヘルスチェック復旧用テストキャスト」(電話番号+生年月日でのセルフ復旧)。
// recover_cast_login はワンタイムパスワードを都度発行するため、上のID/PWテストとは
// 別アカウントを使い、パスワード固定のテストと干渉しないようにしている。
test("phone + birth date recovery reaches mypage", async ({ page }) => {
  await page.goto("/cast/login");
  await page.getByRole("link", { name: "ログインできない方はこちら" }).click();
  await page.waitForURL("**/cast/recover");

  await page.locator('input[type="tel"], input[type="text"]').first().fill("08000000000");
  await page.locator('input[type="date"]').fill("1996-02-02");
  await page.getByRole("button", { name: /送信|復旧|ログイン/ }).click();

  await page.waitForURL("**/cast/mypage", { timeout: 15_000 });
  await expect(page.locator("h1")).toContainText("ヘルスチェック復旧用テストキャスト");
});

// LINEログインは外部OAuthのため完走はできないが、/api/auth/line/start が
// LINEの認可画面まで正しくリダイレクトすることを確認する(=CHANNEL_ID設定が生きている)。
test("LINE login redirects to LINE authorize endpoint", async ({ page }) => {
  await page.goto("/mypage/login");
  await page.getByRole("button", { name: "LINEでログイン" }).click();
  await page.waitForURL(/access\.line\.me\/oauth2/, { timeout: 15_000 });
});

// GoogleログインもSupabase側のOAuth設定が生きていて、Google側の認可画面まで
// リダイレクトが繋がることだけを確認する(実ログインはしない)。
test("Google login redirects to Google OAuth", async ({ page }) => {
  await page.goto("/mypage/login");
  await page.getByRole("button", { name: "Googleでログイン" }).click();
  await page.waitForURL(/accounts\.google\.com/, { timeout: 15_000 });
});

// マジックリンク送信(signInWithOtp)はSupabaseデフォルトのメール送信レート制限が
// 1時間あたり数通と非常に低く、定期実行で毎回叩くと実際のユーザーのログインメールを
// 巻き込んでレート制限に達する恐れがあるため、実送信までは行わない。
// フォーム自体が描画されることは main-links.spec.ts の /mypage/login 死活チェックでカバー済み。
