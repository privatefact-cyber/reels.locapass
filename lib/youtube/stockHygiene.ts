import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 動画ストックの整理(チャンネル単位の「今後収集しない」と、保留のまま放置された候補の自動除外)。
 * データは消さない(除外=記録を残す)ので、次の収集で同じ動画が候補に戻ってこない。
 */

const SITE = "locapass" as const;
const TABLE = "locapass_youtube_ingestions";

/** 保留のまま、この日数が過ぎた候補を自動で「除外」にする。 */
export const STALE_PENDING_DAYS = 14;

/** 今後の収集から外したチャンネルの名前。テーブルが無い・一時的な失敗のときは、収集を止めないよう空で返す。 */
export async function getBlockedChannelTitles(): Promise<string[]> {
  const { data, error } = await (createAdminClient() as any)
    .from("ingestion_blocked_channels")
    .select("channel_title")
    .eq("site", SITE)
    .order("created_at", { ascending: false });
  if (error) return [];
  return ((data ?? []) as { channel_title: string }[]).map((row) => row.channel_title);
}

/**
 * 保留のまま {@link STALE_PENDING_DAYS} 日以上たった候補を「除外」にする(公開済みは対象外)。
 * 手で判定を保存した候補(reviewed_at あり)は、その日からの日数で数える。dryRun なら件数だけ返してDBは変えない。
 */
export async function autoRejectStalePending(options: { dryRun?: boolean } = {}) {
  const admin = createAdminClient() as any;
  const cutoff = new Date(Date.now() - STALE_PENDING_DAYS * 86400000).toISOString();
  const base = (query: any) =>
    query.eq("match_status", "pending").is("reel_id", null).lt("created_at", cutoff).or(`reviewed_at.is.null,reviewed_at.lt.${cutoff}`);
  if (options.dryRun) {
    const { count, error } = await base(admin.from(TABLE).select("id", { count: "exact", head: true }));
    if (error) throw new Error(`件数の確認に失敗しました: ${error.message}`);
    return { dryRun: true, cutoff, wouldReject: count ?? 0 };
  }
  const { data, error } = await base(admin.from(TABLE).update({ match_status: "rejected", reviewed_at: new Date().toISOString() })).select("id");
  if (error) throw new Error(`自動除外に失敗しました: ${error.message}`);
  return { dryRun: false, cutoff, rejected: (data ?? []).length };
}
