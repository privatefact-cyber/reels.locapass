import type { SupabaseClient } from "@supabase/supabase-js";

const DEAD_AFTER = 3;
const TIMEOUT_MS = 12000;
const INTERVAL_MS = 500;
const UA = "Mozilla/5.0 (compatible; LOCAPASS-freshness-check/1.0)";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Outcome = "ok" | "dead" | "error" | "skip";

export type FreshnessResult = { id: string; name: string; url: string | null; outcome: Outcome; detail: string; patch: Record<string, unknown> };

function isSafeHttpUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return null;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(h)) return null;
  if (h === "[::1]" || h.startsWith("[fc") || h.startsWith("[fd") || h.startsWith("[fe80")) return null;
  return u;
}

async function request(u: URL, method: "HEAD" | "GET"): Promise<number> {
  const res = await fetch(u, {
    method,
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "user-agent": UA, accept: "text/html,*/*" },
  });
  if (method === "GET") await res.body?.cancel();
  return res.status;
}

async function probe(u: URL): Promise<{ outcome: Outcome; detail: string }> {
  try {
    let status = await request(u, "HEAD");
    // HEAD を拒否するサイトが多いので、4xx/5xx は GET で再確認する
    if (status >= 400) status = await request(u, "GET");
    if (status < 400) return { outcome: "ok", detail: String(status) };
    if (status === 404 || status === 410) return { outcome: "dead", detail: String(status) };
    // 403/429 などはボット対策の可能性が高いので「死」とは見なさない
    return { outcome: "error", detail: String(status) };
  } catch (e) {
    const code = (e as { cause?: { code?: string } })?.cause?.code ?? (e as Error).name;
    if (code === "ENOTFOUND") return { outcome: "dead", detail: "dns" };
    return { outcome: "error", detail: String(code) };
  }
}

/**
 * locapass_shops の鮮度を更新する(「閉店か」は断定せず、最後に確認できた日を持つ)。
 *  1. 公式URL(url)にアクセスして死活を記録。成功なら last_confirmed_at を更新、失敗は連続回数を数える
 *     (DNS解決不可・404/410 が連続 DEAD_AFTER 回で dead。5xx・タイムアウトは error 扱いで dead にしない)
 *  2. リール(locapass_reels)の最新投稿日があれば last_confirmed_at の候補にする
 * 店舗の公開/非公開(status)は一切変更しない。
 * scripts/check-shop-freshness.ts(手動)と /api/cron/shop-freshness(毎週)の両方から呼ばれる。
 */
export async function runShopFreshnessCheck(
  supabase: SupabaseClient,
  opts: { dryRun?: boolean; onlyPortal?: string } = {},
) {
  const { data: portals } = await supabase.from("locapass_portals").select("id, slug");
  const slugById = new Map((portals ?? []).map((p) => [p.id as number, p.slug as string]));

  const { data: shops, error } = await supabase
    .from("locapass_shops")
    .select("id, portal_id, name, url, last_confirmed_at, last_confirmed_source, url_status, url_fail_count")
    .eq("status", "active")
    .order("portal_id");
  if (error) throw error;
  const targets = (shops ?? []).filter((s) => !opts.onlyPortal || slugById.get(s.portal_id as number) === opts.onlyPortal);

  // 店舗ごとの最新リール投稿日
  const latestReel = new Map<string, string>();
  const { data: reels } = await supabase
    .from("locapass_reels")
    .select("shop_id, created_at")
    .not("shop_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(5000);
  for (const r of reels ?? []) if (!latestReel.has(r.shop_id as string)) latestReel.set(r.shop_id as string, r.created_at as string);

  const now = new Date().toISOString();
  const results: FreshnessResult[] = [];
  const tally: Record<string, number> = { ok: 0, dead: 0, error: 0, skip: 0 };

  for (const shop of targets) {
    const patch: Record<string, unknown> = {};
    let outcome: Outcome = "skip";
    let detail = "";

    const rawUrl = (shop.url as string | null)?.trim();
    const safe = rawUrl ? isSafeHttpUrl(rawUrl) : null;
    if (safe) {
      ({ outcome, detail } = await probe(safe));
      patch.url_checked_at = now;
      if (outcome === "ok") {
        patch.url_status = "ok";
        patch.url_fail_count = 0;
        patch.last_confirmed_at = now;
        patch.last_confirmed_source = "url";
      } else {
        const fails = ((shop.url_fail_count as number) ?? 0) + (outcome === "dead" ? 1 : 0);
        patch.url_fail_count = outcome === "dead" ? fails : (shop.url_fail_count ?? 0);
        patch.url_status = outcome === "dead" && fails >= DEAD_AFTER ? "dead" : outcome === "dead" ? (shop.url_status ?? "unchecked") : "error";
      }
      await sleep(INTERVAL_MS);
    }
    tally[outcome]++;

    // リール投稿は URL 確認より新しければ採用(手動確認 manual は上書きしない)
    const reelAt = latestReel.get(shop.id as string);
    const current = (patch.last_confirmed_at as string | undefined) ?? (shop.last_confirmed_at as string | null) ?? null;
    if (reelAt && (!current || reelAt > current) && shop.last_confirmed_source !== "manual") {
      patch.last_confirmed_at = reelAt;
      patch.last_confirmed_source = "reel";
    }

    if (Object.keys(patch).length === 0) continue;
    results.push({ id: shop.id as string, name: shop.name as string, url: rawUrl ?? null, outcome, detail, patch });
    if (!opts.dryRun) {
      const { error: upErr } = await supabase.from("locapass_shops").update(patch).eq("id", shop.id as string);
      if (upErr) console.error(`更新失敗 ${shop.name}: ${upErr.message}`);
    }
  }

  return { targets: targets.length, tally, results };
}
