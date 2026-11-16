import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 自動収集(定期実行)で公開する動画の上限。エリア(ポータル)ごとに決める。
 *  - dailyMax  : 1日(日本時間)に自動で公開する本数
 *  - totalMax  : そのポータルのYouTube動画の総数(これに届いたら自動では増やさない)
 *  - perShopMax: 1店あたりのYouTube動画の本数
 * 上限が決まっていないポータル(美容など)は、これまでどおり制限なし。
 * 管理者が管理画面から手動で公開する分には、上限をかけない(自動処理だけに効く)。
 */
export type PublishQuota = { dailyMax: number; totalMax: number; perShopMax: number };

const TOKYO_HUB_QUOTA: PublishQuota = { dailyMax: 50, totalMax: 1000, perShopMax: 3 };
/** セブはベータ版。まず1日10本で様子を見る。 */
const CEBU_QUOTA: PublishQuota = { dailyMax: 10, totalMax: 200, perShopMax: 3 };

const QUOTA_BY_SLUG: Record<string, PublishQuota> = { locapass: TOKYO_HUB_QUOTA, cebu: CEBU_QUOTA };

const slugByPortal = new Map<number, string | null>();

export async function quotaForPortal(portalId: number | null | undefined): Promise<PublishQuota | null> {
  if (!portalId) return null;
  if (!slugByPortal.has(portalId)) {
    const { data } = await createAdminClient().from("locapass_portals").select("slug").eq("id", portalId).maybeSingle();
    slugByPortal.set(portalId, (data?.slug as string | undefined) ?? null);
  }
  const slug = slugByPortal.get(portalId);
  return slug ? QUOTA_BY_SLUG[slug] ?? null : null;
}

/** 日本時間の今日0時(ISO)。 */
function startOfTodayJst(now = new Date()) {
  const jst = new Date(now.getTime() + 9 * 3600 * 1000);
  jst.setUTCHours(0, 0, 0, 0);
  return new Date(jst.getTime() - 9 * 3600 * 1000).toISOString();
}

/**
 * いまの時点で、あと何本まで自動で公開してよいか(0なら今回は何もしない)。
 * 1日の残りと、総数の残りの小さい方。
 */
export async function remainingPublishSlots(portalId: number, quota: PublishQuota): Promise<number> {
  const admin = createAdminClient() as any;
  const { count: total } = await admin
    .from("locapass_reels")
    .select("id", { count: "exact", head: true })
    .eq("portal_id", portalId)
    .eq("status", "publish")
    .eq("embed_provider", "youtube");
  // 今日、自動で公開した本数(管理者の手動公開=reviewed_byあり、は数えない)。
  const { count: today } = await admin
    .from("locapass_youtube_ingestions")
    .select("id", { count: "exact", head: true })
    .eq("portal_id", portalId)
    .not("reel_id", "is", null)
    .is("reviewed_by", null)
    .gte("reviewed_at", startOfTodayJst());
  return Math.max(0, Math.min(quota.dailyMax - (today ?? 0), quota.totalMax - (total ?? 0)));
}

/** その店のYouTube動画がすでに上限に達しているか。 */
export async function shopIsAtVideoLimit(shopId: string, quota: PublishQuota): Promise<boolean> {
  const { count } = await (createAdminClient() as any)
    .from("locapass_reels")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .eq("status", "publish")
    .eq("embed_provider", "youtube");
  return (count ?? 0) >= quota.perShopMax;
}
