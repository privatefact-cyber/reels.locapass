import { createStaticClient } from "@/lib/supabase/static";
import { getJstNow, toJstDateString } from "@/lib/reels/nowWorking";
import { AFTER_GENRE, type ShopGenre } from "@/lib/shop/genres";
import type { CastSummary, VenueCardData, VenuePin } from "@/types/venue";

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
/** カード(動画・キャスト付き)の最大取得件数。増やすと転送量が一気に膨らむので上げないこと。 */
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
 * アフター(深夜飲食店)は通常のマップには出さず、アフタータグを押したときだけ出す。
 * afterMode=true ならアフターだけ、false ならアフター以外(ジャンル未設定を含む)を返す。
 * 件数上限はDB側でかけているので、クライアントで後から絞ると枠をアフターに食われる。
 * そのためここで絞り込む。
 */
export function genreModeFilter(afterMode: boolean) {
  return afterMode ? `genre.eq.${AFTER_GENRE}` : `genre.is.null,genre.neq.${AFTER_GENRE}`;
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
 * 地図に打つピンだけの軽量データ。動画URLやキャストは含めない。
 * 広域ズームでクラスタを描くのはこちらだけを使う。
 */
export async function getVenuePins(
  bounds: VenueBounds,
  limit = MAX_PIN_LIMIT,
  afterMode = false,
): Promise<VenuePin[]> {
  const supabase = mapClient();
  const { data } = await supabase
    .from("shops")
    .select("id, lat, lng, genre, is_sponsored")
    .eq("status", "active")
    .or(genreModeFilter(afterMode))
    .gte("lat", bounds.minLat)
    .lte("lat", bounds.maxLat)
    .gte("lng", bounds.minLng)
    .lte("lng", bounds.maxLng)
    .limit(Math.min(limit, MAX_PIN_LIMIT));

  return (data ?? []).map((s) => ({
    id: s.id,
    lat: s.lat as number,
    lng: s.lng as number,
    genre: (s.genre as ShopGenre | null) ?? null,
    isSponsored: s.is_sponsored,
  }));
}

type MediaItem = { type?: string; url?: string };

function firstVideoUrl(media: unknown): string | null {
  if (!Array.isArray(media)) return null;
  const video = (media as MediaItem[]).find((m) => m && m.type === "video" && typeof m.url === "string");
  return video?.url ?? null;
}

/**
 * カルーセル用のカードデータ。範囲内の店舗を中心に近い順に最大limit件だけ取り、
 * その店舗ぶんのキャストとリールの集計だけを追加で引く。
 * 並びは スポンサー → リール投稿数の多い順(入札ロジックが決まるまでの暫定)。
 *
 * カードの見た目:
 * - 画像 … トップヒーロー画像 → メイン画像 → 無ければLOCAPASSの黒背景(クライアント側)。
 * - 動画 … 動画オプション(map_video_enabled)契約店舗だけ。店舗が選んだリール → 最新の動画リール。
 *   軽量プレビュー(reels.preview_url)があればそちらを流す。
 */
export async function getVenueCards(
  bounds: VenueBounds,
  center: { lat: number; lng: number },
  limit = MAX_CARD_LIMIT,
  afterMode = false,
): Promise<VenueCardData[]> {
  const supabase = mapClient();
  const cardLimit = Math.min(limit, MAX_CARD_LIMIT);

  const { data: shopRows } = await supabase
    .from("shops")
    .select(
      "id, name, area, genre, lat, lng, building_name, floor, address_en, supports_english, is_verified, is_sponsored, sponsored_rank, cover_image_url, hero_media_url, hero_media_type, map_video_enabled, map_preview_reel_id",
    )
    .eq("status", "active")
    .or(genreModeFilter(afterMode))
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
  // 動画オプション契約店舗が選んだリール。未選択・契約なしの店舗のぶんは引かない。
  const chosenReelIds = shops
    .filter((s) => s.map_video_enabled && s.map_preview_reel_id)
    .map((s) => s.map_preview_reel_id as string);

  const [{ data: castRows }, { data: reelStats }, { data: chosenReels }] = await Promise.all([
    supabase.from("cast_members").select("id, name, shop_id").in("shop_id", shopIds),
    // 件数と最新の動画1本だけをDBで集計する(全リールを転送して数えない)。
    supabase.rpc("venue_card_reels", { p_shop_ids: shopIds }),
    chosenReelIds.length
      ? supabase
          .from("reels")
          .select("id, shop_id, media, preview_url")
          .in("id", chosenReelIds)
          .eq("status", "published")
          .eq("post_type", "reel")
      : Promise.resolve({ data: [] as { id: string; shop_id: string; media: unknown; preview_url: string | null }[] }),
  ]);

  const casts = castRows ?? [];
  const castIds = casts.map((c) => c.id);

  const [{ data: mediaRows }, { data: scheduleRows }] = await Promise.all([
    castIds.length
      ? supabase
          .from("media")
          .select("cast_id, url, display_order")
          .in("cast_id", castIds)
          .order("display_order", { ascending: true })
      : Promise.resolve({ data: [] as { cast_id: string | null; url: string; display_order: number }[] }),
    castIds.length
      ? supabase
          .from("schedules")
          .select("cast_id")
          .in("cast_id", castIds)
          .eq("date", toJstDateString(getJstNow()))
          .eq("is_working_today", true)
      : Promise.resolve({ data: [] as { cast_id: string }[] }),
  ]);

  const avatarByCastId = new Map<string, string>();
  for (const m of mediaRows ?? []) {
    if (!m.cast_id || avatarByCastId.has(m.cast_id)) continue;
    avatarByCastId.set(m.cast_id, m.url);
  }

  const workingCastIds = new Set((scheduleRows ?? []).map((s) => s.cast_id));

  const castsByShopId = new Map<string, CastSummary[]>();
  for (const c of casts) {
    const list = castsByShopId.get(c.shop_id) ?? [];
    list.push({
      id: c.id,
      name: c.name,
      avatarUrl: avatarByCastId.get(c.id) ?? null,
      isWorkingNow: workingCastIds.has(c.id),
    });
    castsByShopId.set(c.shop_id, list);
  }

  const statsByShopId = new Map((reelStats ?? []).map((r) => [r.shop_id, r]));
  const chosenVideoByShopId = new Map<string, string>();
  for (const r of chosenReels ?? []) {
    const url = r.preview_url ?? firstVideoUrl(r.media);
    if (url) chosenVideoByShopId.set(r.shop_id, url);
  }

  const venues: VenueCardData[] = shops.map((s) => {
    const stats = statsByShopId.get(s.id);
    const videoUrl = s.map_video_enabled
      ? (chosenVideoByShopId.get(s.id) ?? stats?.latest_preview_url ?? stats?.latest_video_url ?? null)
      : null;
    const heroImage = s.hero_media_url && s.hero_media_type === "image" ? s.hero_media_url : null;
    return {
      id: s.id,
      name: s.name,
      area: s.area ?? null,
      genre: (s.genre as ShopGenre | null) ?? null,
      location: {
        lat: s.lat as number,
        lng: s.lng as number,
        buildingName: s.building_name ?? undefined,
        floor: s.floor ?? undefined,
        addressEn: s.address_en ?? undefined,
      },
      distanceMeter: Math.round(s.distance),
      previewVideoUrl: videoUrl,
      imageUrl: heroImage ?? s.cover_image_url ?? null,
      reelCount: stats?.reel_count ?? 0,
      isSponsored: s.is_sponsored,
      sponsoredRank: s.sponsored_rank ?? undefined,
      supportsEnglish: s.supports_english,
      isVerified: s.is_verified,
      casts: (castsByShopId.get(s.id) ?? []).slice(0, 6),
    };
  });

  venues.sort((a, b) => {
    if (a.isSponsored !== b.isSponsored) return a.isSponsored ? -1 : 1;
    if (a.isSponsored && b.isSponsored) {
      return (a.sponsoredRank ?? 999) - (b.sponsoredRank ?? 999);
    }
    return (statsByShopId.get(b.id)?.reel_count ?? 0) - (statsByShopId.get(a.id)?.reel_count ?? 0);
  });

  return venues;
}
