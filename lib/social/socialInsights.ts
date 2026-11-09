import { createAdminClient } from "@/lib/supabase/admin";
import { getInstagramMediaInsights } from "@/lib/social/instagram";
import { getThreadsMediaInsights } from "@/lib/social/threads";
import { resolveSocialToken } from "@/lib/social/tokens";

const db = () => createAdminClient() as any;
const INSTAGRAM_METRICS = ["views", "reach", "likes", "comments", "saved", "shares", "total_interactions"];

export type InsightRow = {
  post_id: string; collected_on: string; views: number; reach: number; likes: number;
  comments: number; replies: number; reposts: number; quotes: number; shares: number;
  saves: number; total_interactions: number;
};

function jstDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

async function threadsInsights(token: string, mediaId: string): Promise<Record<string, number>> {
  const config = { userId: process.env.THREADS_USER_ID?.trim() || null, accessToken: token };
  try { return await getThreadsMediaInsights(config, mediaId); }
  catch {
    // 新旧APIや投稿形式の差で一部の指標だけ使えない場合に備え、基本の反応数は投稿情報から補う。
    throw new Error("Threadsの成績を取得できませんでした(threads_manage_insights権限を確認してください)");
  }
}

/** Instagramは投稿形式ごとに指標が違う。まとめて失敗したら、取れる項目だけを1つずつ集める。 */
async function instagramInsights(token: string, mediaId: string): Promise<Record<string, number>> {
  try { return await getInstagramMediaInsights(token, mediaId, INSTAGRAM_METRICS); }
  catch {
    const out: Record<string, number> = {};
    for (const metric of INSTAGRAM_METRICS) {
      try { Object.assign(out, await getInstagramMediaInsights(token, mediaId, [metric])); } catch { /* この形式では使えない指標 */ }
    }
    if (!Object.keys(out).length) throw new Error("利用できる成績項目がありません(権限または投稿形式を確認してください)");
    return out;
  }
}

function snapshot(postId: string, values: Record<string, number>) {
  return {
    post_id: postId, collected_on: jstDate(), views: values.views ?? 0, reach: values.reach ?? 0,
    likes: values.likes ?? 0, comments: values.comments ?? 0, replies: values.replies ?? 0,
    reposts: values.reposts ?? 0, quotes: values.quotes ?? 0, shares: values.shares ?? 0,
    saves: values.saved ?? values.saves ?? 0, total_interactions: values.total_interactions ?? 0,
    raw_metrics: values, collected_at: new Date().toISOString(),
  };
}

/** 直近90日の投稿を少しずつ巡回する。1件の失敗で他の処理は止めない。 */
export async function collectSocialInsights(limit = 20): Promise<{ checked: number; saved: number; failed: number }> {
  const admin = db();
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data, error } = await admin.from("locapass_threads_posts")
    .select("id, external_id, platform, account").eq("status", "posted").not("external_id", "is", null)
    .gte("posted_at", since).order("insights_checked_at", { ascending: true, nullsFirst: true }).limit(Math.max(1, Math.min(limit, 50)));
  if (error) throw new Error(`成績を集める投稿の取得に失敗しました: ${error.message}`);
  let saved = 0; let failed = 0;
  for (const post of data ?? []) {
    try {
      const token = await resolveSocialToken(post.platform, post.account);
      if (!token) throw new Error("トークンが未設定です");
      const values = post.platform === "instagram"
        ? await instagramInsights(token, post.external_id)
        : await threadsInsights(token, post.external_id);
      const { error: saveError } = await admin.from("locapass_social_insights").upsert(snapshot(post.id, values), { onConflict: "post_id,collected_on" });
      if (saveError) throw new Error(saveError.message);
      await admin.from("locapass_threads_posts").update({ insights_checked_at: new Date().toISOString(), insights_error: null }).eq("id", post.id);
      saved++;
    } catch (e) {
      failed++;
      const message = e instanceof Error ? e.message.slice(0, 400) : "成績を取得できませんでした";
      await admin.from("locapass_threads_posts").update({ insights_checked_at: new Date().toISOString(), insights_error: message }).eq("id", post.id);
    }
  }
  return { checked: (data ?? []).length, saved, failed };
}

export async function listLatestInsights(): Promise<Record<string, InsightRow>> {
  const { data } = await db().from("locapass_social_insights").select("post_id, collected_on, views, reach, likes, comments, replies, reposts, quotes, shares, saves, total_interactions").order("collected_on", { ascending: false }).limit(200);
  const out: Record<string, InsightRow> = {};
  for (const row of data ?? []) if (!out[row.post_id]) out[row.post_id] = row as InsightRow;
  return out;
}
