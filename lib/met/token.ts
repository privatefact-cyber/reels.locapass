import { createHmac, timingSafeEqual } from "crypto";

/**
 * 「直接会った人用のQR」の署名つきトークン。FACES本人の画面に出して、目の前の人に読んでもらう。
 * 数分で期限が切れるので、写真に撮られても、SNSに載せられても、すぐ使えなくなる。DBには何も保存しない。
 * 形: <キャストID(ハイフンなし32桁)>.<期限(Unix秒を36進数)>.<署名(先頭12バイトをbase64url)>
 */
export const MET_TOKEN_TTL_SEC = 10 * 60;

function key(): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("サーバーの設定が不足しています");
  return createHmac("sha256", "locapass-met-qr-v1").update(secret).digest();
}

function sign(payload: string): string {
  return createHmac("sha256", key()).update(payload).digest().subarray(0, 12).toString("base64url");
}

function compact(castId: string): string {
  return castId.replace(/-/g, "").toLowerCase();
}

function expand(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function issueMetToken(castId: string, nowMs = Date.now()): { token: string; expiresAt: number } {
  const exp = Math.floor(nowMs / 1000) + MET_TOKEN_TTL_SEC;
  const payload = `${compact(castId)}.${exp.toString(36)}`;
  return { token: `${payload}.${sign(payload)}`, expiresAt: exp * 1000 };
}

export type MetTokenResult = { ok: true; castId: string; expiresAt: number } | { ok: false; reason: "invalid" | "expired" };

export function verifyMetToken(token: string, nowMs = Date.now()): MetTokenResult {
  const parts = token.split(".");
  if (parts.length !== 3 || !/^[0-9a-f]{32}$/.test(parts[0]) || !/^[0-9a-z]{1,10}$/.test(parts[1])) return { ok: false, reason: "invalid" };
  const payload = `${parts[0]}.${parts[1]}`;
  const given = Buffer.from(parts[2], "base64url");
  const expected = Buffer.from(sign(payload), "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "invalid" };
  const exp = parseInt(parts[1], 36);
  if (!Number.isFinite(exp) || exp * 1000 < nowMs) return { ok: false, reason: "expired" };
  return { ok: true, castId: expand(parts[0]), expiresAt: exp * 1000 };
}

/**
 * 署名だけを確かめて、期限は見ずに中身を取り出す(ログイン・登録の途中で、QRの期限が切れたときの救済用)。
 * 「QRを読んだ」という事実は、下の pending クッキーで30分だけ覚えておく。
 */
export function parseMetToken(token: string, nowMs = Date.now()): { castId: string; expired: boolean } | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !/^[0-9a-f]{32}$/.test(parts[0]) || !/^[0-9a-z]{1,10}$/.test(parts[1])) return null;
  const given = Buffer.from(parts[2], "base64url");
  const expected = Buffer.from(sign(`${parts[0]}.${parts[1]}`), "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const exp = parseInt(parts[1], 36);
  if (!Number.isFinite(exp)) return null;
  return { castId: expand(parts[0]), expired: exp * 1000 < nowMs };
}

/** QRを読んだ人が、ログイン・登録を終えて戻ってくるまでの猶予。 */
export const MET_PENDING_TTL_SEC = 30 * 60;
export const MET_PENDING_COOKIE = "met_pending";

export function issueMetPending(castId: string, nowMs = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + MET_PENDING_TTL_SEC;
  const payload = `p.${compact(castId)}.${exp.toString(36)}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyMetPending(value: string | undefined, castId: string, nowMs = Date.now()): boolean {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "p" || parts[1] !== compact(castId) || !/^[0-9a-z]{1,10}$/.test(parts[2])) return false;
  const given = Buffer.from(parts[3], "base64url");
  const expected = Buffer.from(sign(`${parts[0]}.${parts[1]}.${parts[2]}`), "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  return parseInt(parts[2], 36) * 1000 >= nowMs;
}
