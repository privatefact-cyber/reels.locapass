import { createStaticClient } from "@/lib/supabase/static";
import type { VenueBounds } from "@/lib/map/getVenues";

/**
 * 移動販売(Caravan。locapass_portals.features に 'mobile')の店は、固定の住所ではなく「いま出店している場所」だけを地図に出す。
 * 出店場所は位置つきイベント(locapass_shop_events の lat/lng。00159)で、開始〜終了の間だけ有効。
 * 位置の列が無い(マイグレーション前)・取得に失敗したときは、何も足さず通常のピンだけを返す。
 */

// 生成済みの型に features・イベントの位置の列が無いので any で扱う。
type Loose = { from: (t: string) => any };

export async function getMobilePortalIds(supabase: Loose): Promise<Set<number>> {
  const { data } = await supabase.from("locapass_portals").select("id").contains("features", ["mobile"]);
  return new Set(((data ?? []) as { id: number }[]).map((p) => p.id));
}

export type SpotWindow = { lat: number; lng: number; address: string | null; startsAt: string; endsAt: string };

/**
 * 範囲内の出店場所(位置つきイベント)を、店ごとに1つ返す。
 * 「いま営業中」があればそれ、無ければ「これから一番早い予定」。予定を入れた時点から地図に出す(営業中かどうかは startsAt/endsAt を見る側が判定する)。
 */
export async function getLiveSpots(supabase: Loose, bounds: VenueBounds): Promise<Map<string, SpotWindow>> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("locapass_shop_events")
    .select("shop_id, lat, lng, address, starts_at, ends_at")
    .not("lat", "is", null)
    .gte("ends_at", nowIso)
    .gte("lat", bounds.minLat)
    .lte("lat", bounds.maxLat)
    .gte("lng", bounds.minLng)
    .lte("lng", bounds.maxLng)
    .order("starts_at", { ascending: true })
    .limit(1000);
  const spots = new Map<string, SpotWindow>();
  if (error) return spots;
  for (const r of data ?? []) {
    const w: SpotWindow = { lat: r.lat, lng: r.lng, address: r.address ?? null, startsAt: r.starts_at, endsAt: r.ends_at };
    const cur = spots.get(r.shop_id);
    const isLive = w.startsAt <= nowIso;
    // 昇順なので、最初に見つけたものが「いま営業中のうち一番古い開始」または「一番早い予定」。営業中を予定より優先する。
    if (!cur || (isLive && cur.startsAt > nowIso)) spots.set(r.shop_id, w);
  }
  return spots;
}

/**
 * 固定位置の店の一覧(rows)から移動販売の店を外し、出店予定のある移動販売の店(位置は出店場所)を足して返す。
 * 足した店には spot(開始・終了)が付く。select は rows と同じ列(lat, lng, portal_id を含む)。
 */
export async function mergeLiveSpots<T extends { id: string; lat: number | null; lng: number | null; portal_id?: number | null }>(
  rows: T[],
  bounds: VenueBounds,
  select: string,
  /** 出店中の店を引き直すときの列(省略時は select と同じ)。ピンでは、一覧に出す店名などを足す。 */
  liveSelect: string = select,
): Promise<(T & { spot?: { startsAt: string; endsAt: string; address: string | null } })[]> {
  const supabase = createStaticClient() as unknown as Loose;
  const [mobilePortals, spots] = await Promise.all([getMobilePortalIds(supabase), getLiveSpots(supabase, bounds)]);
  const fixed = mobilePortals.size ? rows.filter((r) => r.portal_id == null || !mobilePortals.has(r.portal_id)) : rows;
  if (spots.size === 0) return fixed;
  const { data } = await supabase.from("locapass_shops").select(liveSelect).in("id", [...spots.keys()]).eq("status", "active");
  const live = ((data ?? []) as unknown as T[]).map((s) => {
    const w = spots.get(s.id)!;
    return { ...s, lat: w.lat, lng: w.lng, spot: { startsAt: w.startsAt, endsAt: w.endsAt, address: w.address } };
  });
  const seen = new Set(fixed.map((r) => r.id));
  return [...fixed, ...live.filter((s) => !seen.has(s.id))];
}
