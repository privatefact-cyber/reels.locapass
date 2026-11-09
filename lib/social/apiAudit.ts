import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveSocialToken, TOKEN_TARGETS, type TokenAccount, type TokenPlatform } from "@/lib/social/tokens";

/**
 * Meta API の実機監査。4つの投稿先のトークンで、読み取り(GET)だけを試し、
 * 「権限が付いている」と「実際に使える」を区別して記録する。投稿・削除・返信などの書き込みは一切しない。
 * 保存するのは、成否・エラーの番号と文面・返ってきた件数・項目名だけ(トークンも、他人の投稿の本文も保存しない)。
 */
const THREADS = "https://graph.threads.net/v1.0";
const INSTAGRAM = "https://graph.instagram.com/v22.0";

type Ctx = { userId: string; postId: string | null; username: string };
type Probe = {
  id: string; label: string; needs: string;
  /** null を返すと「前提がなくて試せない」(skipped)。 */
  build: (ctx: Ctx) => { path: string; params: Record<string, string> } | null;
  skipReason?: string;
};

export type AuditRow = {
  platform: TokenPlatform; account: TokenAccount; probe: string; label: string; needs: string;
  status: "ok" | "error" | "skipped"; http_status: number | null; error_code: number | null; error_subcode: number | null;
  message: string | null; items: number | null; keys: string[];
};

const THREADS_PROBES: Probe[] = [
  { id: "threads.threads_publishing_limit", label: "投稿の残り枠(1日250件)", needs: "threads_basic + threads_content_publish", build: (c) => ({ path: `/${c.userId}/threads_publishing_limit`, params: { fields: "quota_usage,config" } }) },
  { id: "threads.my_posts", label: "自分の投稿の一覧", needs: "threads_basic", build: (c) => ({ path: `/${c.userId}/threads`, params: { fields: "id,media_type,timestamp", limit: "1" } }) },
  { id: "threads.media_insights", label: "投稿ごとの成績(見られた数・いいね等)", needs: "threads_manage_insights", skipReason: "投稿が無い", build: (c) => (c.postId ? { path: `/${c.postId}/insights`, params: { metric: "views,likes,replies,reposts,quotes,shares" } } : null) },
  { id: "threads.user_insights", label: "アカウント全体の成績", needs: "threads_manage_insights", build: (c) => ({ path: `/${c.userId}/threads_insights`, params: { metric: "views,likes,followers_count" } }) },
  { id: "threads.post_replies", label: "自分の投稿への返信を読む", needs: "threads_read_replies", skipReason: "投稿が無い", build: (c) => (c.postId ? { path: `/${c.postId}/replies`, params: { fields: "id,timestamp", limit: "1" } } : null) },
  { id: "threads.my_replies", label: "自分が書いた返信の一覧", needs: "threads_read_replies", build: (c) => ({ path: `/${c.userId}/replies`, params: { fields: "id,timestamp", limit: "1" } }) },
  { id: "threads.mentions", label: "自分へのメンションを読む", needs: "threads_manage_mentions", build: (c) => ({ path: `/${c.userId}/mentions`, params: { fields: "id,timestamp", limit: "1" } }) },
  { id: "threads.keyword_search", label: "キーワード検索(公開投稿)", needs: "threads_keyword_search(公開投稿は審査後)", build: () => ({ path: "/keyword_search", params: { q: "カフェ", search_type: "RECENT", fields: "id,timestamp,media_type", limit: "1" } }) },
  { id: "threads.profile_lookup", label: "他人のプロフィール取得", needs: "threads_profile_discovery(標準では公式アカウントのみ)", build: () => ({ path: "/profile_lookup", params: { username: "threads", fields: "username,follower_count" } }) },
];

const INSTAGRAM_PROBES: Probe[] = [
  { id: "instagram.profile", label: "プロフィール(種類・フォロワー数)", needs: "instagram_business_basic", build: () => ({ path: "/me", params: { fields: "user_id,username,account_type,followers_count,media_count" } }) },
  { id: "instagram.my_media", label: "自分の投稿の一覧", needs: "instagram_business_basic", build: () => ({ path: "/me/media", params: { fields: "id,media_product_type,timestamp", limit: "1" } }) },
  { id: "instagram.media_insights", label: "投稿ごとの成績", needs: "instagram_business_manage_insights", skipReason: "投稿が無い", build: (c) => (c.postId ? { path: `/${c.postId}/insights`, params: { metric: "reach,likes,comments,saved,shares,total_interactions" } } : null) },
  { id: "instagram.account_insights", label: "アカウント全体の成績", needs: "instagram_business_manage_insights", build: () => ({ path: "/me/insights", params: { metric: "reach", period: "day" } }) },
  { id: "instagram.comments", label: "自分の投稿のコメントを読む", needs: "instagram_business_manage_comments", skipReason: "投稿が無い", build: (c) => (c.postId ? { path: `/${c.postId}/comments`, params: { fields: "id,timestamp", limit: "1" } } : null) },
  { id: "instagram.conversations", label: "DMの会話一覧", needs: "instagram_business_manage_messages", build: () => ({ path: "/me/conversations", params: { platform: "instagram", limit: "1" } }) },
  { id: "instagram.publishing_limit", label: "投稿の残り枠(1日100件)", needs: "instagram_business_content_publish", build: () => ({ path: "/me/content_publishing_limit", params: { fields: "quota_usage,config" } }) },
  { id: "instagram.stories_list", label: "ストーリーズの一覧", needs: "instagram_business_basic", build: () => ({ path: "/me/stories", params: { fields: "id,timestamp", limit: "1" } }) },
  { id: "instagram.tags", label: "自分がタグ付けされた投稿", needs: "instagram_business_basic", build: () => ({ path: "/me/tags", params: { fields: "id,timestamp", limit: "1" } }) },
  { id: "instagram.hashtag_search", label: "ハッシュタグ検索", needs: "Facebookログイン方式のみ(Instagramログインでは非対応の見込み)", build: (c) => ({ path: "/ig_hashtag_search", params: { user_id: c.userId, q: "cafe" } }) },
  { id: "instagram.business_discovery", label: "他の公開ビジネスアカウントの情報", needs: "Facebookログイン方式のみ(見込み)", build: () => ({ path: "/me", params: { fields: "business_discovery.username(instagram){username,followers_count}" } }) },
];

function redact(text: string, token: string): string {
  return text.split(token).join("***").slice(0, 400);
}

async function runProbe(platform: TokenPlatform, token: string, probe: Probe, ctx: Ctx): Promise<{ row: Omit<AuditRow, "platform" | "account">; body: any }> {
  const base = { probe: probe.id, label: probe.label, needs: probe.needs, error_code: null as number | null, error_subcode: null as number | null, message: null as string | null, items: null as number | null, keys: [] as string[] };
  const built = probe.build(ctx);
  if (!built) return { row: { ...base, status: "skipped", http_status: null, message: probe.skipReason ?? "前提が無い" }, body: null };
  const params = new URLSearchParams({ ...built.params, access_token: token });
  try {
    // 必ず GET。書き込みは行わない。
    const res = await fetch(`${platform === "threads" ? THREADS : INSTAGRAM}${built.path}?${params}`, { method: "GET", signal: AbortSignal.timeout(20_000) });
    const body = (await res.json().catch(() => ({}))) as any;
    if (!res.ok || body?.error) {
      const e = body?.error ?? {};
      return { row: { ...base, status: "error", http_status: res.status, error_code: typeof e.code === "number" ? e.code : null, error_subcode: typeof e.error_subcode === "number" ? e.error_subcode : null, message: redact(String(e.message ?? `HTTP ${res.status}`), token) }, body };
    }
    const list = Array.isArray(body?.data) ? body.data : null;
    const keys = list?.[0] && typeof list[0] === "object" ? Object.keys(list[0]) : Object.keys(body ?? {});
    return { row: { ...base, status: "ok", http_status: res.status, items: list ? list.length : null, keys: keys.slice(0, 20) }, body };
  } catch (e) {
    return { row: { ...base, status: "error", http_status: null, message: redact(e instanceof Error ? e.message : "通信に失敗", token) }, body: null };
  }
}

async function auditTarget(platform: TokenPlatform, account: TokenAccount): Promise<AuditRow[]> {
  const token = await resolveSocialToken(platform, account);
  const probes = platform === "threads" ? THREADS_PROBES : INSTAGRAM_PROBES;
  const tag = { platform, account };
  if (!token) return probes.map((p) => ({ ...tag, probe: p.id, label: p.label, needs: p.needs, status: "skipped" as const, http_status: null, error_code: null, error_subcode: null, message: "トークン未設定", items: null, keys: [] }));

  // 持ち主のidと、成績・返信・コメントの確認に使う「自分の最新の投稿」を先に取る(どちらも読み取りだけ)。
  const me = await runProbe(platform, token, platform === "threads"
    ? { id: "_me", label: "", needs: "", build: () => ({ path: "/me", params: { fields: "id,username" } }) }
    : { id: "_me", label: "", needs: "", build: () => ({ path: "/me", params: { fields: "user_id,username" } }) }, { userId: "me", postId: null, username: "" });
  const userId = String(me.body?.user_id ?? me.body?.id ?? "me");
  const ctx: Ctx = { userId, postId: null, username: String(me.body?.username ?? "") };
  const list = await runProbe(platform, token, { id: "_list", label: "", needs: "", build: () => ({ path: platform === "threads" ? `/${userId}/threads` : "/me/media", params: { fields: "id", limit: "1" } }) }, ctx);
  ctx.postId = list.body?.data?.[0]?.id ? String(list.body.data[0].id) : null;

  const rows: AuditRow[] = [];
  for (const probe of probes) {
    const { row } = await runProbe(platform, token, probe, ctx);
    rows.push({ ...tag, ...row });
  }
  return rows;
}

/** 4つの投稿先すべてを監査して、結果をDBに保存する。 */
export async function runSocialApiAudit(): Promise<{ runId: string; rows: AuditRow[] }> {
  const runId = randomUUID();
  const groups = await Promise.all(TOKEN_TARGETS.map((t) => auditTarget(t.platform, t.account)));
  const rows = groups.flat();
  const { error } = await (createAdminClient() as any).from("locapass_social_api_audit").insert(rows.map((r) => ({ ...r, run_id: runId })));
  if (error) throw new Error(`監査結果を保存できませんでした: ${error.message}`);
  return { runId, rows };
}

export async function latestAuditRows(): Promise<{ at: string | null; rows: AuditRow[] }> {
  const admin = createAdminClient() as any;
  const { data: latest } = await admin.from("locapass_social_api_audit").select("run_id, created_at").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!latest) return { at: null, rows: [] };
  const { data } = await admin.from("locapass_social_api_audit").select("platform, account, probe, label, needs, status, http_status, error_code, error_subcode, message, items, keys").eq("run_id", latest.run_id).order("id", { ascending: true });
  return { at: latest.created_at as string, rows: (data ?? []) as AuditRow[] };
}
