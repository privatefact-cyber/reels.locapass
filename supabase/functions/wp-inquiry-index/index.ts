// wp-inquiry-index: コンシェルジュAIの店舗検索用データ(wp_inquiry.shop_index)を作る・更新する。
//  - locapass_shops(locapass.net系。全ポータル) → scope_key='locapass'
//  - 店舗数の多い kb_documents のサイト(luxela.jp等) → scope_key='kb:<site_id>'
// 紹介文が変わった店だけ、意味ベクトル(埋め込み)を作り直す。「新しさ」「有料」の点数は毎回つけ直す(安い処理)。
// 定期実行(pg_cron)と、手動の実行の両方から呼べる。何度呼んでも安全(変更が無ければ何もしない)。
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIM = 768;
const EMBED_BATCH = 50;
const KB_INDEX_MIN_DOCS = 60; // これ以上の資料があるサイトだけ索引する(少ないサイトは従来どおり全店を渡す)
const MAX_EMBED_PER_RUN = 400; // 1回の実行で作り直す埋め込みの上限(超えた分は次の実行で)

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Row = {
  scope_key: string;
  shop_id: string;
  portal_id: number | null;
  genre: string | null;
  area: string | null;
  title: string;
  url: string;
  search_text: string;
  embedText: string;
  fresh: number;
  paid: number;
};

function freshScore(lastActivityIso: string | null | undefined, halflifeDays: number): number {
  if (!lastActivityIso) return 0;
  const days = Math.max(0, (Date.now() - new Date(lastActivityIso).getTime()) / 86400000);
  return Math.round(Math.pow(0.5, days / halflifeDays) * 1000) / 1000;
}

function stripAdminPrefix(title: string): string {
  return title.replace(/^[\[［【].*?[\]］】]\s*/u, "").trim();
}

async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: texts.map((t) => ({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text: t }] },
          taskType: "RETRIEVAL_DOCUMENT",
          outputDimensionality: EMBED_DIM,
        })),
      }),
    },
  );
  if (!res.ok) throw new Error(`embed batch failed ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.embeddings ?? []).map((e: { values?: number[] }) => (Array.isArray(e.values) ? e.values : null));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(url, key, { db: { schema: "wp_inquiry" } });
  const pub = createClient(url, key);

  const { data: settingsRow } = await db.from("concierge_settings").select("fresh_halflife_days").eq("id", true).maybeSingle();
  const halflife = Number(settingsRow?.fresh_halflife_days ?? 45);

  const rows: Row[] = [];

  // ---- locapass.net(全ポータルの店舗) ----
  const { data: shops, error: shopsError } = await pub
    .from("locapass_shops")
    .select("id, portal_id, name, category, tagline, address, description, business_hours, updated_at, plan, is_temporarily_closed")
    .eq("status", "active")
    .limit(20000);
  if (shopsError) return json({ error: "locapass_shops: " + shopsError.message }, 500);

  const since = new Date(Date.now() - 365 * 86400000).toISOString();
  const lastReelByShop = new Map<string, string>();
  const { data: reels } = await pub
    .from("locapass_reels")
    .select("shop_id, published_at")
    .eq("status", "publish")
    .not("shop_id", "is", null)
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(20000);
  for (const r of reels ?? []) {
    const sid = r.shop_id as string;
    if (!lastReelByShop.has(sid) && r.published_at) lastReelByShop.set(sid, r.published_at as string);
  }

  for (const s of shops ?? []) {
    const activity = [s.updated_at as string | null, lastReelByShop.get(s.id as string) ?? null]
      .filter((v): v is string => Boolean(v))
      .sort()
      .pop();
    const parts = [s.category, s.tagline, s.address, s.description ? String(s.description).slice(0, 400) : null].filter(Boolean);
    rows.push({
      scope_key: "locapass",
      shop_id: s.id as string,
      portal_id: (s.portal_id as number | null) ?? null,
      genre: (s.category as string | null) ?? null,
      area: null,
      title: s.name as string,
      url: `https://locapass.net/shops/${s.id}`,
      search_text: [s.name, ...parts].join(" "),
      embedText: [s.name, ...parts].join("\n"),
      fresh: freshScore(activity, halflife),
      paid: s.plan && s.plan !== "free" ? 1 : 0,
    });
  }

  // ---- kb_documents(店舗数の多いサイト。luxela.jp等) ----
  const { data: sites } = await db.from("sites").select("id, domain").eq("is_active", true);
  const uuidRe = /\/shops\/([0-9a-fA-F-]{36})/;
  for (const site of sites ?? []) {
    if (String(site.domain).startsWith("locapass.net")) continue;
    const { data: docs } = await db.from("kb_documents").select("title, url, content, updated_at").eq("site_id", site.id).limit(20000);
    if (!docs || docs.length < KB_INDEX_MIN_DOCS) continue;
    const ids = docs.map((d) => String(d.url).match(uuidRe)?.[1]).filter((v): v is string => Boolean(v));
    const extras = new Map<string, { genre: string | null; area: string | null; sponsored: boolean }>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data: srows } = await pub
        .from("shops")
        .select("id, genre, area, is_sponsored, status")
        .in("id", ids.slice(i, i + 200))
        .eq("status", "active");
      for (const s of srows ?? []) {
        extras.set(s.id as string, { genre: (s.genre as string | null) ?? null, area: (s.area as string | null) ?? null, sponsored: Boolean(s.is_sponsored) });
      }
    }
    for (const d of docs) {
      const shopId = String(d.url).match(uuidRe)?.[1];
      if (!shopId) continue;
      const x = extras.get(shopId);
      if (!x) continue; // 非公開の店は索引しない
      const title = stripAdminPrefix(String(d.title));
      const body = String(d.content ?? "").slice(0, 500);
      rows.push({
        scope_key: `kb:${site.id}`,
        shop_id: shopId,
        portal_id: null,
        genre: x.genre,
        area: x.area,
        title,
        url: String(d.url),
        search_text: [title, x.genre, x.area, body].filter(Boolean).join(" "),
        embedText: [title, x.genre, x.area, body].filter(Boolean).join("\n"),
        fresh: freshScore(d.updated_at as string, halflife),
        paid: x.sponsored ? 1 : 0,
      });
    }
  }

  // ---- 既存の索引と比べて、変わった店だけ埋め込みを作り直す ----
  const existing = new Map<string, { content_hash: string; has_embedding: boolean }>();
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await db
      .from("shop_index")
      .select("scope_key, shop_id, content_hash, embedding")
      .range(from, from + 999);
    if (error) return json({ error: "shop_index read: " + error.message }, 500);
    for (const e of page ?? []) existing.set(`${e.scope_key}|${e.shop_id}`, { content_hash: e.content_hash as string, has_embedding: e.embedding != null });
    if (!page || page.length < 1000) break;
  }

  const hashed = await Promise.all(rows.map(async (r) => ({ r, hash: await sha256(r.embedText) })));
  const toEmbed = hashed.filter(({ r, hash }) => {
    const e = existing.get(`${r.scope_key}|${r.shop_id}`);
    return !e || e.content_hash !== hash || !e.has_embedding;
  });
  const limited = toEmbed.slice(0, MAX_EMBED_PER_RUN);

  let embedded = 0;
  const errors: string[] = [];
  for (let i = 0; i < limited.length; i += EMBED_BATCH) {
    const chunk = limited.slice(i, i + EMBED_BATCH);
    try {
      const vectors = await embedBatch(chunk.map((c) => c.r.embedText));
      const upserts = chunk.map((c, k) => ({
        scope_key: c.r.scope_key,
        shop_id: c.r.shop_id,
        portal_id: c.r.portal_id,
        genre: c.r.genre,
        area: c.r.area,
        title: c.r.title,
        url: c.r.url,
        search_text: c.r.search_text,
        content_hash: c.hash,
        embedding: vectors[k] ? JSON.stringify(vectors[k]) : null,
        fresh: c.r.fresh,
        paid: c.r.paid,
        indexed_at: new Date().toISOString(),
      }));
      const { error } = await db.from("shop_index").upsert(upserts, { onConflict: "scope_key,shop_id" });
      if (error) errors.push("upsert: " + error.message);
      else embedded += upserts.length;
    } catch (err) {
      errors.push(String(err));
    }
  }

  // 埋め込みは作り直さない店も、新しさ・有料の点数と表示用の項目は毎回更新する。
  const embeddedKeys = new Set(limited.map(({ r }) => `${r.scope_key}|${r.shop_id}`));
  let rescored = 0;
  for (const { r, hash } of hashed) {
    const k = `${r.scope_key}|${r.shop_id}`;
    if (embeddedKeys.has(k) || !existing.has(k)) continue;
    const { error } = await db
      .from("shop_index")
      .update({ fresh: r.fresh, paid: r.paid, portal_id: r.portal_id, genre: r.genre, area: r.area, title: r.title, url: r.url, search_text: r.search_text, content_hash: hash })
      .eq("scope_key", r.scope_key)
      .eq("shop_id", r.shop_id);
    if (error) errors.push("rescore: " + error.message);
    else rescored++;
  }

  // 非公開になった・消えた店を索引から外す。
  const alive = new Set(rows.map((r) => `${r.scope_key}|${r.shop_id}`));
  const stale = [...existing.keys()].filter((k) => !alive.has(k));
  let removed = 0;
  for (const k of stale) {
    const [scope, shopId] = k.split("|");
    const { error } = await db.from("shop_index").delete().eq("scope_key", scope).eq("shop_id", shopId);
    if (!error) removed++;
  }

  return json({
    ok: errors.length === 0,
    total: rows.length,
    embedded,
    pending_embed: Math.max(0, toEmbed.length - limited.length),
    rescored,
    removed,
    errors: errors.slice(0, 5),
  });
});
