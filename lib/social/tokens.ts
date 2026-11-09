import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Instagram / Threads の長期トークン(約60日)を、期限前に自動で延長する。
 * 延長で得た新しいトークンは locapass_social_tokens に保存し、投稿はそちらを優先して使う。
 * Vercelの環境変数のトークンは、最初の元になる(手で入れ直したら、そちらが優先される)。
 * 仕様: Threads=GET graph.threads.net/refresh_access_token(th_refresh_token) / Instagram=GET graph.instagram.com/refresh_access_token(ig_refresh_token)。
 * 発行から24時間たっていないトークンは延長できない(その場合は翌日に再試行する)。
 */
export type TokenPlatform = "instagram" | "threads";
export type TokenAccount = "locapass" | "luxela";

export const TOKEN_TARGETS: { platform: TokenPlatform; account: TokenAccount; label: string }[] = [
  { platform: "instagram", account: "locapass", label: "Instagram LOCAPASS" },
  { platform: "instagram", account: "luxela", label: "Instagram LUXELA" },
  { platform: "threads", account: "locapass", label: "Threads LOCAPASS" },
  { platform: "threads", account: "luxela", label: "Threads LUXELA" },
];

const db = () => createAdminClient() as any;
const REFRESH_AFTER_DAYS = 14;

function envToken(platform: TokenPlatform, account: TokenAccount): string | null {
  const name = platform === "instagram" ? (account === "luxela" ? "INSTAGRAM_ACCESS_TOKEN_LUXELA" : "INSTAGRAM_ACCESS_TOKEN_LOCAPASS") : account === "luxela" ? "THREADS_ACCESS_TOKEN_LUXELA" : "THREADS_ACCESS_TOKEN";
  return process.env[name]?.trim() || null;
}

const fingerprint = (token: string) => createHash("sha256").update(token).digest("hex").slice(0, 16);

type Row = { platform: string; account: string; token: string | null; env_fingerprint: string | null; expires_at: string | null; refreshed_at: string | null; last_attempt_at: string | null; last_error: string | null; fail_count: number };

async function readRow(platform: TokenPlatform, account: TokenAccount): Promise<Row | null> {
  const { data } = await db().from("locapass_social_tokens").select("*").eq("platform", platform).eq("account", account).maybeSingle();
  return (data as Row | null) ?? null;
}

/** 投稿に使うトークン。延長済みの保存分があればそれ、なければ環境変数。 */
export async function resolveSocialToken(platform: TokenPlatform, account: TokenAccount): Promise<string | null> {
  const env = envToken(platform, account);
  try {
    const row = await readRow(platform, account);
    if (row?.token && env && row.env_fingerprint === fingerprint(env)) return row.token;
    if (row?.token && !env) return row.token;
  } catch {
    // 読めなければ環境変数にもどす(投稿を止めない)
  }
  return env;
}

async function callRefresh(platform: TokenPlatform, token: string): Promise<{ token: string; expiresInSec: number }> {
  const url = platform === "threads"
    ? `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(token)}`
    : `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: { message?: string } };
  if (!res.ok || body.error || !body.access_token) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  return { token: body.access_token, expiresInSec: Number(body.expires_in) || 60 * 24 * 3600 };
}

export type RefreshOutcome = { label: string; status: "refreshed" | "skipped" | "no_token" | "failed"; detail?: string };

/** 4つの投稿先のトークンを、必要なら延長する。force=true なら、直近に更新していても延長する。 */
export async function refreshSocialTokens(options?: { force?: boolean }): Promise<RefreshOutcome[]> {
  const out: RefreshOutcome[] = [];
  for (const t of TOKEN_TARGETS) {
    const current = await resolveSocialToken(t.platform, t.account);
    if (!current) { out.push({ label: t.label, status: "no_token" }); continue; }
    const row = await readRow(t.platform, t.account).catch(() => null);
    const stale = !row?.refreshed_at || Date.now() - new Date(row.refreshed_at).getTime() > REFRESH_AFTER_DAYS * 86_400_000;
    if (!options?.force && !stale) { out.push({ label: t.label, status: "skipped" }); continue; }
    const env = envToken(t.platform, t.account);
    try {
      const fresh = await callRefresh(t.platform, current);
      const { error } = await db().from("locapass_social_tokens").upsert({
        platform: t.platform, account: t.account, token: fresh.token, env_fingerprint: env ? fingerprint(env) : null,
        expires_at: new Date(Date.now() + fresh.expiresInSec * 1000).toISOString(), refreshed_at: new Date().toISOString(),
        last_attempt_at: new Date().toISOString(), last_error: null, fail_count: 0,
      }, { onConflict: "platform,account" });
      if (error) throw new Error(`保存に失敗: ${error.message}`);
      out.push({ label: t.label, status: "refreshed" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "延長に失敗";
      await db().from("locapass_social_tokens").upsert({
        platform: t.platform, account: t.account, token: row?.token ?? null, env_fingerprint: row?.env_fingerprint ?? null,
        expires_at: row?.expires_at ?? null, refreshed_at: row?.refreshed_at ?? null,
        last_attempt_at: new Date().toISOString(), last_error: message.slice(0, 300), fail_count: (row?.fail_count ?? 0) + 1,
      }, { onConflict: "platform,account" });
      out.push({ label: t.label, status: "failed", detail: message });
    }
  }
  return out;
}

export type TokenStatus = { label: string; hasToken: boolean; expiresAt: string | null; daysLeft: number | null; lastError: string | null; failCount: number; warn: string | null };

/** 管理画面に出す、トークンの状態と警告。 */
export async function getTokenStatuses(): Promise<TokenStatus[]> {
  const result: TokenStatus[] = [];
  for (const t of TOKEN_TARGETS) {
    const hasToken = Boolean(envToken(t.platform, t.account));
    const row = await readRow(t.platform, t.account).catch(() => null);
    const expiresAt = row?.expires_at ?? null;
    const daysLeft = expiresAt ? Math.floor((new Date(expiresAt).getTime() - Date.now()) / 86_400_000) : null;
    let warn: string | null = null;
    if (hasToken) {
      if (daysLeft !== null && daysLeft <= 14) warn = `期限まであと${Math.max(daysLeft, 0)}日です`;
      else if (!expiresAt && (row?.fail_count ?? 0) >= 3) warn = "自動更新が続けて失敗しています";
      else if (daysLeft !== null && (row?.fail_count ?? 0) >= 3) warn = "自動更新が続けて失敗しています";
    }
    result.push({ label: t.label, hasToken, expiresAt, daysLeft, lastError: row?.last_error ?? null, failCount: row?.fail_count ?? 0, warn });
  }
  return result;
}

export type TokenCheck = { label: string; ok: boolean; detail: string };

/** トークンが本当に使えるか確認する(各APIに「持ち主は誰か」を問い合わせるだけ。投稿はしない)。中身は出さず、長さと形だけ見せる。 */
export async function checkSocialTokens(): Promise<TokenCheck[]> {
  const out: TokenCheck[] = [];
  for (const t of TOKEN_TARGETS) {
    const token = await resolveSocialToken(t.platform, t.account);
    if (!token) { out.push({ label: t.label, ok: false, detail: "未設定" }); continue; }
    const shape = `長さ${token.length}・先頭${token.slice(0, 4)}${/\s/.test(token) ? "・空白/改行あり" : ""}${/[^\x21-\x7e]/.test(token) ? "・全角/不可視の文字あり" : ""}`;
    try {
      const url = t.platform === "threads"
        ? `https://graph.threads.net/v1.0/me?fields=username&access_token=${encodeURIComponent(token)}`
        : `https://graph.instagram.com/v22.0/me?fields=username&access_token=${encodeURIComponent(token)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      const body = (await res.json().catch(() => ({}))) as { username?: string; error?: { message?: string } };
      if (res.ok && body.username) out.push({ label: t.label, ok: true, detail: `@${body.username} で有効(${shape})` });
      else out.push({ label: t.label, ok: false, detail: `${body.error?.message ?? `HTTP ${res.status}`}(${shape})` });
    } catch (e) {
      out.push({ label: t.label, ok: false, detail: `${e instanceof Error ? e.message : "確認に失敗"}(${shape})` });
    }
  }
  return out;
}
