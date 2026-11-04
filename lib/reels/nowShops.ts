import { getJstNow } from "@/lib/reels/nowWorking";
import { isOpenNow, sanitizeWeekly } from "@/lib/shop/businessHours";
import type { VenueBounds } from "@/lib/map/getVenues";

// イベントの位置の列・ブーストのテーブルは生成済みの型に無いので any で扱う。
type Loose = { from: (t: string) => any };

/**
 * NOW(いま営業中)の店舗ID。トップのNOWタブと、地図の「今」スイッチで同じ判定を使う。
 * - 営業時間は店舗が登録した曜日ごとのカレンダー(locapass_shops.business_hours_weekly)で、今(JST)が営業時間内の店。
 *   未記入の店は対象外(記入した時点から入る)。
 * - 移動販売の店は、曜日カレンダーではなく「出店予定(位置つきイベント)」が営業時間にあたる。
 *   いま開始〜終了の間にある出店予定の店も、営業中として数える(位置の列が無い等で失敗したら無視)。
 * portalId を渡すとそのポータルの店だけ(トップの子ポータル用)、bounds を渡すとその範囲の店だけ(地図用)。
 */
export async function getNowShopIds(
  supabase: unknown,
  opts: { portalId?: number | null; bounds?: VenueBounds } = {},
): Promise<Set<string>> {
  const db = supabase as Loose;
  const { portalId = null, bounds } = opts;

  let shopsQuery = db
    .from("locapass_shops")
    .select("id, business_hours_weekly")
    .eq("status", "active")
    .not("business_hours_weekly", "is", null);
  if (portalId !== null) shopsQuery = shopsQuery.eq("portal_id", portalId);
  if (bounds) {
    shopsQuery = shopsQuery
      .gte("lat", bounds.minLat)
      .lte("lat", bounds.maxLat)
      .gte("lng", bounds.minLng)
      .lte("lng", bounds.maxLng);
  }

  const { data: shops } = await shopsQuery;
  const nowJst = getJstNow();
  const ids = new Set<string>(
    ((shops ?? []) as { id: string; business_hours_weekly: unknown }[])
      .filter((s) => isOpenNow(sanitizeWeekly(s.business_hours_weekly), nowJst))
      .map((s) => s.id),
  );

  const nowIso = new Date().toISOString();
  let liveQuery = db
    .from("locapass_shop_events")
    .select("shop_id")
    .not("lat", "is", null)
    .lte("starts_at", nowIso)
    .gte("ends_at", nowIso);
  if (bounds) {
    liveQuery = liveQuery
      .gte("lat", bounds.minLat)
      .lte("lat", bounds.maxLat)
      .gte("lng", bounds.minLng)
      .lte("lng", bounds.maxLng);
  }
  const { data: liveEvents } = await liveQuery.limit(500);
  const liveShopIds = [...new Set(((liveEvents ?? []) as { shop_id: string }[]).map((e) => e.shop_id))].filter((id) => !ids.has(id));
  if (liveShopIds.length > 0) {
    let q = db.from("locapass_shops").select("id").eq("status", "active").in("id", liveShopIds);
    if (portalId !== null) q = q.eq("portal_id", portalId);
    const { data: liveShops } = await q;
    for (const s of (liveShops ?? []) as { id: string }[]) ids.add(s.id);
  }
  return ids;
}
