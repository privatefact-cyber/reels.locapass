import { createStaticClient } from "@/lib/supabase/static";
import type { VenueCardData, VenuePin } from "@/types/venue";

/**
 * 地図の取得範囲。全国一括取得はメモリ・転送量が破綻するため、
 * 必ず「今見えている範囲」か「現在地から半径N m」に絞ってから問い合わせる。
 */
export type VenueBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

export const DEFAULT_RADIUS_M = 500;
/** カード(動画付き)の最大取得件数。増やすと転送量が一気に膨らむので上げないこと。 */
export const MAX_CARD_LIMIT = 30;
/** 軽量ピンの最大取得件数。広域ズーム時の保険。 */
export const MAX_PIN_LIMIT = 2000;

/** 半径(m)を緯度経度の矩形に変換する。経度側の1度は緯度によって縮むので補正する。 */
export function radiusToBounds(lat: number, lng: number, radiusM: number): VenueBounds {
  const latDelta = radiusM / 111_320;
  const lngDelta = radiusM / (111_320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}

export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * マップの取得はすべて公開情報だけなので、ログイン状態(cookie)に依存しないクライアントで引く。
 * cookieを読まない＝利用者ごとに結果が変わらないので、APIの応答をCDNでキャッシュできる
 * (app/api/venues の Cache-Control)。
 */
function mapClient() {
  return createStaticClient();
}

/**
 * ジャンル(業種)フィルターのピル用に、掲載中店舗の実カテゴリを重複無しで返す。
 * locapass_shops.categoryはサイトごとに自由入力なので、LUXELA側のような固定リストは無い。
 */
export async function getVenueGenres(): Promise<string[]> {
  const supabase = mapClient();
  const { data } = await supabase
    .from("locapass_shops")
    .select("category")
    .eq("status", "active")
    .not("category", "is", null)
    .not("lat", "is", null)
    .not("lng", "is", null);

  return Array.from(new Set((data ?? []).map((s) => s.category).filter((g): g is string => !!g)));
}

/**
 * 地図に打つピンだけの軽量データ。動画URLは含めない。
 * 広域ズームでクラスタを描くのはこちらだけを使う。
 */
export async function getVenuePins(bounds: VenueBounds, limit = MAX_PIN_LIMIT): Promise<VenuePin[]> {
  const supabase = mapClient();
  const { data } = await supabase
    .from("locapass_shops")
    .select("id, lat, lng, category")
    .eq("status", "active")
    .not("lat", "is", null)
    .not("lng", "is", null)
    .gte("lat", bounds.minLat)
    .lte("lat", bounds.maxLat)
    .gte("lng", bounds.minLng)
    .lte("lng", bounds.maxLng)
    .limit(Math.min(limit, MAX_PIN_LIMIT));

  return (data ?? []).map((s) => ({
    id: s.id,
    lat: s.lat as number,
    lng: s.lng as number,
    genre: s.category,
    // 現状locapass_shopsは全店舗plan="free"でスポンサー枠が無いため常にfalse。
    isSponsored: false,
  }));
}

/**
 * カルーセル用のカードデータ。範囲内の店舗を中心に近い順に最大limit件だけ取り、
 * その店舗ぶんの公開リール件数・サムネイルを追加で引く。
 * locapass_shopsにはキャスト・スポンサー枠・動画オプション契約の概念が無いため、
 * casts/sponsoredRank/supportsEnglish/isVerifiedは常に空/falseで返す
 * (受け皿はUI側に残るが対応データが無いため)。
 */
export async function getVenueCards(
  bounds: VenueBounds,
  center: { lat: number; lng: number },
  limit = MAX_CARD_LIMIT,
): Promise<VenueCardData[]> {
  const supabase = mapClient();
  const cardLimit = Math.min(limit, MAX_CARD_LIMIT);

  const { data: shopRows } = await supabase
    .from("locapass_shops")
    .select("id, name, category, lat, lng, icon_url, cover_url")
    .eq("status", "active")
    .not("lat", "is", null)
    .not("lng", "is", null)
    .gte("lat", bounds.minLat)
    .lte("lat", bounds.maxLat)
    .gte("lng", bounds.minLng)
    .lte("lng", bounds.maxLng)
    // 矩形内が多すぎる場合に備えて、DB側でも上限をかけてから中心に近い順に詰める。
    .limit(MAX_PIN_LIMIT);

  const shops = (shopRows ?? [])
    .map((s) => ({
      ...s,
      distance: distanceMeters(center.lat, center.lng, s.lat as number, s.lng as number),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, cardLimit);

  if (shops.length === 0) return [];

  const shopIds = shops.map((s) => s.id);
  const { data: reelRows } = await supabase
    .from("locapass_reels")
    .select("shop_id, video_url, published_at")
    .in("shop_id", shopIds)
    .eq("status", "publish")
    .order("published_at", { ascending: false });

  const reelCountByShopId = new Map<string, number>();
  const latestVideoByShopId = new Map<string, string>();
  for (const r of reelRows ?? []) {
    if (!r.shop_id) continue;
    reelCountByShopId.set(r.shop_id, (reelCountByShopId.get(r.shop_id) ?? 0) + 1);
    if (r.video_url && !latestVideoByShopId.has(r.shop_id)) {
      latestVideoByShopId.set(r.shop_id, r.video_url);
    }
  }

  const venues: VenueCardData[] = shops.map((s) => ({
    id: s.id,
    name: s.name,
    area: null,
    genre: s.category,
    location: { lat: s.lat as number, lng: s.lng as number },
    distanceMeter: Math.round(s.distance),
    previewVideoUrl: latestVideoByShopId.get(s.id) ?? null,
    imageUrl: s.cover_url ?? s.icon_url ?? null,
    reelCount: reelCountByShopId.get(s.id) ?? 0,
    isSponsored: false,
    sponsoredRank: undefined,
    supportsEnglish: false,
    isVerified: false,
    casts: [],
  }));

  venues.sort((a, b) => b.reelCount - a.reelCount);

  return venues;
}
