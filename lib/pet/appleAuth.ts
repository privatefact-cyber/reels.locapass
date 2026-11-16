import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 「Appleでサインイン」の、アカウント削除時の取り消し(App Storeの審査ガイドライン5.1.1(v))。
 *  1) サインインのとき、アプリが受け取った認可コードを、更新用トークンに交換して保存する(コードは短時間で失効する)
 *  2) アカウントを削除するとき、その更新用トークンをAppleに送って、連携を取り消す
 * Appleの認証キー(.p8。通知用と同じ鍵。Sign in with Apple を有効にしてある)を使う。
 * 環境変数: APNS_KEY_P8 / APNS_KEY_ID / APNS_TEAM_ID / APNS_BUNDLE_ID(アプリのBundle ID。Appleの「クライアントID」)
 */
const APPLE_AUTH = "https://appleid.apple.com/auth";

export function appleAuthConfigured(): boolean {
  return Boolean(process.env.APNS_KEY_P8 && process.env.APNS_KEY_ID);
}

function clientId(): string {
  return process.env.APNS_BUNDLE_ID || "net.locapass.pet";
}

/** Appleに送る「クライアントシークレット」(鍵で署名した短命のJWT。有効期間5分) */
export function appleClientSecret(): string {
  const key = (process.env.APNS_KEY_P8 ?? "").replace(/\\n/g, "\n");
  const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "ES256", kid: process.env.APNS_KEY_ID });
  const body = b64({ iss: process.env.APNS_TEAM_ID || "7D746B5DRM", iat: now, exp: now + 300, aud: "https://appleid.apple.com", sub: clientId() });
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${head}.${body}.${sig}`;
}

type AppleResult = { status: number; body: Record<string, unknown> };

async function postApple(path: "token" | "revoke", params: Record<string, string>): Promise<AppleResult> {
  const res = await fetch(`${APPLE_AUTH}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId(), client_secret: appleClientSecret(), ...params }),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = {};
  }
  return { status: res.status, body };
}

/** サインインのときに受け取った認可コードを更新用トークンに交換して保存する(失敗してもログインは止めない) */
export async function saveAppleRefreshToken(admin: SupabaseClient, userId: string, authorizationCode: string): Promise<boolean> {
  if (!appleAuthConfigured() || !authorizationCode) return false;
  try {
    const res = await postApple("token", { grant_type: "authorization_code", code: authorizationCode });
    const refresh = res.body.refresh_token;
    if (res.status !== 200 || typeof refresh !== "string") {
      console.error("[apple-auth] code exchange failed", res.status, res.body.error);
      return false;
    }
    const { error } = await admin.from("locapass_apple_tokens").upsert({ user_id: userId, refresh_token: refresh, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) console.error("[apple-auth] save failed", error.message);
    return !error;
  } catch (e) {
    console.error("[apple-auth] exchange error", e);
    return false;
  }
}

/** アカウント削除のとき、Appleとの連携を取り消す。取り消せなくても削除は止めない。取り消した(または対象がない)ときは true */
export async function revokeAppleForUser(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await admin.from("locapass_apple_tokens").select("refresh_token").eq("user_id", userId).maybeSingle();
  if (!data?.refresh_token) return true; // Appleでサインインしていない(または、保存前の古いサインイン)
  if (!appleAuthConfigured()) {
    console.error("[apple-auth] revoke skipped: key not configured");
    return false;
  }
  try {
    const res = await postApple("revoke", { token: data.refresh_token as string, token_type_hint: "refresh_token" });
    if (res.status !== 200) {
      console.error("[apple-auth] revoke failed", res.status, res.body.error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[apple-auth] revoke error", e);
    return false;
  }
}
