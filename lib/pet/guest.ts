import crypto from "node:crypto";
import { headers } from "next/headers";

/**
 * ログインなし(ゲスト)の「見つけました」通報・目撃情報のための、いたずら対策。
 * - 送信元IPは生のまま持たず、ハッシュにして回数制限だけに使う
 * - Cloudflare Turnstile(無料の人間チェック)の鍵が設定されていれば、それも確かめる
 *   (NEXT_PUBLIC_TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY。未設定の間は回数制限+おとり欄だけ)
 */
export const GUEST_LIMITS = { upload: 10, found: 5, sighting: 10 } as const;

export async function guestIpHash(): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
  const salt = process.env.PET_IP_SALT ?? process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(-16) ?? "locapass-pet";
  return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export function turnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

export async function verifyTurnstile(token: string | null | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) return true; // 未設定の間は回数制限だけで受ける
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(8_000),
    });
    const body = (await res.json().catch(() => null)) as { success?: boolean } | null;
    return Boolean(body?.success);
  } catch {
    return false;
  }
}

/** ゲストの通報を、あとで解決・削除するための管理用トークン(DBにはハッシュだけを保存) */
export function newManageToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(18).toString("base64url");
  return { token, hash: hashManageToken(token) };
}

export function hashManageToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
