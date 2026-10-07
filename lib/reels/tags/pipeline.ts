/**
 * リール1本分のタグ付け: 処理権の確保 → サムネ+キャプション+文字起こしをAIへ → タグを保存。
 * 投稿者のセッション付きSupabaseクライアントで書き込む(RLSが「自分のリールだけ」に絞る。service roleは使わない)。
 * 失敗しても投稿には影響しない(タグが付かないだけ)。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyReelTags } from "./classify";

/** 1日(UTC日付)にタグ付けする本数の上限(課金事故を防ぐサーキットブレーカー)。環境変数で変えられる。 */
const DAILY_LIMIT = Number(process.env.TAG_DAILY_LIMIT ?? 600);
/** 処理中のまま固まったリールを再処理してよいとみなす時間。 */
const STALE_PENDING_MS = 10 * 60 * 1000;

export type TagRunResult = "done" | "skipped" | "capped" | "busy" | "failed";

/**
 * 未処理(または失敗/固まった)リールだけを対象にタグ付けする。同じリールを同時に2回は動かさない。
 * force=trueなら処理済みでも付け直す(バックフィル用)。
 */
export async function claimAndRunTags(db: SupabaseClient, reelId: string, opts: { force?: boolean } = {}): Promise<TagRunResult> {
  const { data: reel } = await db
    .from("locapass_reels")
    .select("id, video_url, poster_url, images, caption, reel_type, tags_status, locapass_shops!locapass_reels_shop_id_fkey ( name, category )")
    .eq("id", reelId)
    .maybeSingle();
  if (!reel || reel.reel_type === "story") return "skipped";
  if (!opts.force && reel.tags_status === "ready") return "skipped";

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count } = await db
    .from("locapass_reels")
    .select("id", { count: "exact", head: true })
    .gte("tags_generated_at", startOfDay.toISOString());
  if ((count ?? 0) >= DAILY_LIMIT) {
    console.error("[tags] daily limit reached", DAILY_LIMIT);
    return "capped";
  }

  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - STALE_PENDING_MS).toISOString();
  const claimFilter = opts.force
    ? `tags_status.is.null,tags_status.neq.pending,and(tags_status.eq.pending,tags_generated_at.lt.${staleBefore})`
    : `tags_status.is.null,tags_status.eq.failed,and(tags_status.eq.pending,tags_generated_at.lt.${staleBefore})`;
  const { data: claimed } = await db
    .from("locapass_reels")
    .update({ tags_status: "pending", tags_generated_at: now })
    .eq("id", reelId)
    .or(claimFilter)
    .select("id");
  if (!claimed || claimed.length === 0) return "busy";

  try {
    const shop = Array.isArray(reel.locapass_shops) ? reel.locapass_shops[0] : reel.locapass_shops;
    const images = (reel.images as { url: string }[] | null) ?? [];

    // 字幕用の文字起こし(日本語があれば優先、無ければある言語)。声なし・字幕未生成なら無し。
    const { data: capRows } = await db.from("locapass_reel_captions").select("lang, cues").eq("reel_id", reelId);
    const capRow = capRows?.find((r) => r.lang === "ja") ?? capRows?.[0];
    const transcript = Array.isArray(capRow?.cues) ? (capRow.cues as { t: string }[]).map((c) => c.t).join("\n") : null;

    const tags = await classifyReelTags({
      imageUrl: reel.video_url ? reel.poster_url : (images[0]?.url ?? reel.poster_url),
      caption: reel.caption,
      transcript,
      shopName: (shop as { name?: string } | null)?.name ?? null,
      category: (shop as { category?: string } | null)?.category ?? null,
    });

    const { error } = await db
      .from("locapass_reels")
      .update({ tags, tags_status: "ready", tags_generated_at: new Date().toISOString() })
      .eq("id", reelId);
    if (error) throw new Error(`タグの保存に失敗: ${error.message}`);
    return "done";
  } catch (cause) {
    console.error("[tags] pipeline failed", reelId, cause);
    await db.from("locapass_reels").update({ tags_status: "failed" }).eq("id", reelId);
    return "failed";
  }
}
