import { createClient } from "@/lib/supabase/server";
import { getJstNow } from "@/lib/reels/nowWorking";
import { isOpenNow, sanitizeWeekly } from "@/lib/shop/businessHours";
import { REEL_SELECT, toReelItem } from "@/lib/reels/getPortalFeedData";
import type { ReelItem } from "@/lib/reels/types";

/**
 * NOWタブ用: 今(JST)営業時間内の店舗の、最新リールを店舗ごとに1本ずつ返す。
 * 営業時間は店舗が登録した曜日ごとのカレンダー(locapass_shops.business_hours_weekly)で判定する。
 * 未記入の店舗は対象外(記入した時点から表示される)。運営の公式店舗も、営業時間を入れていれば対象にする。siteIdがnullなら全エリア横断。
 */
export async function getNowReels(siteId: number | null): Promise<ReelItem[]> {
  const supabase = await createClient();

  let shopsQuery = supabase
    .from("locapass_shops")
    .select("id, business_hours_weekly")
    .eq("status", "active")
    .not("business_hours_weekly", "is", null);
  if (siteId !== null) shopsQuery = shopsQuery.eq("portal_id", siteId);

  const { data: shops } = await shopsQuery;
  const nowJst = getJstNow();
  const openShopIds = (shops ?? [])
    .filter((s) => isOpenNow(sanitizeWeekly(s.business_hours_weekly), nowJst))
    .map((s) => s.id);
  if (openShopIds.length === 0) return [];

  const { data: rows } = await supabase
    .from("locapass_reels")
    .select(REEL_SELECT)
    .in("shop_id", openShopIds)
    .eq("status", "publish")
    .or("expires_at.is.null,expires_at.gt.now()")
    .order("published_at", { ascending: false })
    .limit(300);

  // published_at降順で取得済みなので、店舗ごとに最初に出てきたもの(=最新)だけ残す。
  const seen = new Set<string>();
  const out: ReelItem[] = [];
  for (const row of rows ?? []) {
    if (!row.shop_id || seen.has(row.shop_id)) continue;
    const item = toReelItem(row);
    if (!item) continue;
    seen.add(row.shop_id);
    out.push(item);
  }
  return out;
}
