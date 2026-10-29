import { createStaticClient } from "@/lib/supabase/static";
import { EXCLUDE_OFFICIAL_FILTER } from "@/lib/shop/genres";
import { isPlacePhotoUrl } from "@/components/shop/PlacePhotoCredit";
import type { CastSummary, VenueCardData, VenuePin } from "@/types/venue";
import { getJstNow, toJstDateString } from "@/lib/reels/nowWorking";
import { sanitizeImageUrl } from "@/lib/utils/sanitize-image-url";
import { gridThumb } from "@/lib/images/thumb";
import { mergeLiveSpots } from "@/lib/map/liveSpots";
import { hasRealPhoto } from "@/lib/shop/sinkWithoutPhoto";
import { shopPath } from "@/lib/locapass/publicUrls";

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
 * locapass_shops.category は lib/shop/locapassCategories.ts の固定リスト(+運営の「公式」)。
 */
export async function getVenueGenres(): Promise<string[]> {
  const supabase = mapClient();
  const { data } = await supabase
    .from("locapass_shops")
    .select("category")
    .eq("status", "active")
    .not("category", "is", null)
    .or(EXCLUDE_OFFICIAL_FILTER)
    .not("lat", "is", null)
    .not("lng", "is", null);

  return Array.from(new Set((data ?? []).map((s) => s.category).filter((g): g is string => !!g)));
}

/**
 * ピンの丸いサムネイルに使う店舗画像。Google写真(中継)は表示のたびに有料APIを叩くため、地図の大量のピンには使わない。
 * 仮のイメージ画像も店舗の写真ではないので使わない(どちらも点のまま)。
 */
function pinThumbUrl(url: string | null | undefined): string | null {
  const clean = sanitizeImageUrl(url);
  if (!clean || isPlacePhotoUrl(clean) || /placeholder/i.test(clean)) return null;
  return gridThumb(clean, 120) ?? null;
}

/** リール1本から、地図用の静止画を取り出す(動画ならポスター、写真ならその1枚目)。無ければundefined。 */
function reelStillUrl(row: { poster_url: string | null; images: unknown }): string | undefined {
  const images = Array.isArray(row.images) ? (row.images as { url?: unknown }[]) : [];
  for (const img of images) {
    const clean = typeof img?.url === "string" ? sanitizeImageUrl(img.url) : undefined;
    if (clean) return clean;
  }
  return sanitizeImageUrl(row.poster_url) ?? undefined;
}

/** 写真(表紙・アイコン)が無い店の代わりに、最新の通常リールの静止画を探す件数の上限。URLが長くなりすぎないよう100件ずつ引く。 */
const REEL_STILL_LOOKUP_LIMIT = 300;

/**
 * 表紙もアイコンも無い店のために、最新の通常リール(ストーリーではないもの)の静止画を、店ごとに1枚返す。
 * 写真のある店には影響しない(呼び出し側は、写真が無い店のIDだけを渡す)。
 */
export async function latestReelStillsByShop(shopIds: string[]): Promise<Map<string, string>> {
  const stills = new Map<string, string>();
  const ids = shopIds.slice(0, REEL_STILL_LOOKUP_LIMIT);
  if (ids.length === 0) return stills;
  const supabase = mapClient();
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
  const results = await Promise.all(
    chunks.map((chunk) =>
      supabase
        .from("locapass_reels")
        .select("shop_id, poster_url, images, published_at")
        .in("shop_id", chunk)
        .eq("status", "publish")
        .eq("reel_type", "permanent")
        // スクリプトで作った仮のリール(イメージ写真)は、店が投稿した写真ではないので使わない。
        .eq("is_placeholder", false)
        .order("published_at", { ascending: false })
        .limit(400),
    ),
  );
  for (const { data } of results) {
    for (const r of data ?? []) {
      if (!r.shop_id || stills.has(r.shop_id)) continue;
      const url = reelStillUrl(r);
      if (url) stills.set(r.shop_id, url);
    }
  }
  return stills;
}

/** 店舗ごとの、最新の通常リールの投稿日時(ISO文字列)。リールの無い店は含めない。 */
async function latestReelDatesByShop(shopIds: string[]): Promise<Map<string, string>> {
  const dates = new Map<string, string>();
  const ids = shopIds.slice(0, REEL_STILL_LOOKUP_LIMIT);
  if (ids.length === 0) return dates;
  const supabase = mapClient();
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
  const results = await Promise.all(
    chunks.map((chunk) =>
      supabase
        .from("locapass_reels")
        .select("shop_id, published_at")
        .in("shop_id", chunk)
        .eq("status", "publish")
        .eq("reel_type", "permanent")
        .not("published_at", "is", null)
        .order("published_at", { ascending: false })
        .limit(400),
    ),
  );
  for (const { data } of results) {
    for (const r of data ?? []) {
      if (r.shop_id && r.published_at && !dates.has(r.shop_id)) dates.set(r.shop_id, r.published_at);
    }
  }
  return dates;
}

/**
 * 地図に打つピンだけの軽量データ。動画URLは含めない。
 * 広域ズームでクラスタを描くのはこちらだけを使う。
 */
const PIN_COLUMNS = "id, lat, lng, category, cover_url, icon_url, updated_at, portal_id";

export async function getVenuePins(bounds: VenueBounds, limit = MAX_PIN_LIMIT): Promise<VenuePin[]> {
  const supabase = mapClient();
  const { data } = await supabase
    .from("locapass_shops")
    .select(PIN_COLUMNS)
    .eq("status", "active")
    .not("lat", "is", null)
    .not("lng", "is", null)
    .gte("lat", bounds.minLat)
    .lte("lat", bounds.maxLat)
    .gte("lng", bounds.minLng)
    .lte("lng", bounds.maxLng)
    .limit(Math.min(limit, MAX_PIN_LIMIT));

  // 移動販売の店は固定位置を外し、いま出店中の場所だけを足す(lib/map/liveSpots.ts)。
  const rows = (await mergeLiveSpots(data ?? [], bounds, PIN_COLUMNS, `${PIN_COLUMNS}, name, slug, portal:locapass_portals ( slug )`)) as NonNullable<typeof data>;

  // 同じ場所(約10m四方)の店は、1つのピンにまとめる。雑居ビルの3階・4階のように座標が同じ店が多いため。
  // 代表は「一番情報が新しい店」(店舗情報の更新日と、最新リールの投稿日の新しい方)。
  // 丸い写真のピンを出したい店は、情報を更新すればよい、という考え方。
  const groups = new Map<string, typeof rows>();
  for (const s of rows) {
    // 移動販売の出店場所は、同じ場所の固定店舗とまとめず、1店ごとに別のピンにする。
    const key = (s as { spot?: unknown }).spot ? `spot:${s.id}` : `${(s.lat as number).toFixed(4)},${(s.lng as number).toFixed(4)}`;
    const list = groups.get(key);
    if (list) list.push(s);
    else groups.set(key, [s]);
  }
  const crowdedIds = Array.from(groups.values())
    .filter((g) => g.length > 1)
    .flatMap((g) => g.map((s) => s.id));
  const latestReelAt = await latestReelDatesByShop(crowdedIds);
  const freshness = (s: (typeof rows)[number]) =>
    Math.max(Date.parse(s.updated_at ?? "") || 0, Date.parse(latestReelAt.get(s.id) ?? "") || 0);

  const pins: VenuePin[] = Array.from(groups.values()).map((g) => {
    const s = g.length === 1 ? g[0] : [...g].sort((a, b) => freshness(b) - freshness(a) || a.id.localeCompare(b.id))[0];
    return {
      id: s.id,
      lat: s.lat as number,
      lng: s.lng as number,
      genre: s.category,
      // 現状locapass_shopsは全店舗plan="free"でスポンサー枠が無いため常にfalse。
      isSponsored: false,
      thumbUrl: pinThumbUrl(s.cover_url ?? s.icon_url),
      ...(() => {
        const live = s as unknown as { spot?: VenuePin["spot"]; name?: string; slug?: string; portal?: { slug: string } | { slug: string }[] | null };
        if (!live.spot) return {};
        const portal = Array.isArray(live.portal) ? live.portal[0] : live.portal;
        return {
          spot: {
            ...live.spot,
            shop: {
              name: live.name ?? "",
              href: portal && live.slug ? shopPath(portal.slug, live.slug) : "/map",
              imageUrl: pinThumbUrl(s.icon_url ?? s.cover_url),
              genre: s.category,
            },
          },
        };
      })(),
      ...(g.length > 1 ? { memberIds: g.map((m) => m.id) } : {}),
    };
  });

  // 表紙もアイコンも無い店は、点のままだと見つけにくいので、最新リールの写真をサムネイルにする。
  const noPhotoIds = pins.filter((p) => !p.thumbUrl).map((p) => p.id);
  if (noPhotoIds.length > 0) {
    const stills = await latestReelStillsByShop(noPhotoIds);
    for (const p of pins) {
      if (!p.thumbUrl) p.thumbUrl = pinThumbUrl(stills.get(p.id));
    }
  }
  return pins;
}

/**
 * カルーセル用のカードデータ(本家 getVenueCards と同じ組み立て)。範囲内の店舗を中心に近い順に
 * 最大limit件だけ取り、その店舗ぶんの公開リール件数・動画・在籍キャストを追加で引く。
 * - 動画 … 動画オプション(map_video_enabled)契約店舗だけ。店舗が選んだリール → 最新の動画リール。
 *   軽量プレビュー(preview_url)があればそちらを流す。
 * - 写真 … トップ画像(画像のとき) → メイン画像 → アイコン。
 * locapass_shops にはスポンサー枠・英語対応・認証バッジの概念が無いため、その3つは常に false で返す。
 */
const CARD_COLUMNS =
  "id, name, slug, area, category, lat, lng, address_en, icon_url, cover_url, cover_image_attribution, hero_media_url, hero_media_type, map_video_enabled, map_preview_reel_id, portal_id, portal:locapass_portals ( slug )";

export async function getVenueCards(
  bounds: VenueBounds,
  center: { lat: number; lng: number },
  limit = MAX_CARD_LIMIT,
): Promise<VenueCardData[]> {
  const supabase = mapClient();
  const cardLimit = Math.min(limit, MAX_CARD_LIMIT);

  const { data: rawShopRows } = await supabase
    .from("locapass_shops")
    .select(CARD_COLUMNS)
    .eq("status", "active")
    .not("lat", "is", null)
    .not("lng", "is", null)
    .gte("lat", bounds.minLat)
    .lte("lat", bounds.maxLat)
    .gte("lng", bounds.minLng)
    .lte("lng", bounds.maxLng)
    // 矩形内が多すぎる場合に備えて、DB側でも上限をかけてから中心に近い順に詰める。
    .limit(MAX_PIN_LIMIT);
  // 移動販売の店は、いま出店中の場所だけを出す。
  const shopRows = (await mergeLiveSpots(rawShopRows ?? [], bounds, CARD_COLUMNS)) as NonNullable<typeof rawShopRows>;

  const shops = (shopRows ?? [])
    .map((s) => ({
      ...s,
      portal: Array.isArray(s.portal) ? s.portal[0] : s.portal,
      distance: distanceMeters(center.lat, center.lng, s.lat as number, s.lng as number),
    }))
    .filter((s) => s.portal !== null)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, cardLimit);

  if (shops.length === 0) return [];

  const shopIds = shops.map((s) => s.id);
  // 動画オプション契約店舗が選んだリール。未選択・契約なしの店舗のぶんは引かない。
  const chosenReelIds = shops
    .filter((s) => s.map_video_enabled && s.map_preview_reel_id)
    .map((s) => s.map_preview_reel_id as string);

  const [{ data: reelRows }, { data: chosenReels }, { data: castRows }] = await Promise.all([
    supabase
      .from("locapass_reels")
      .select("shop_id, video_url, preview_url, poster_url, images, reel_type, published_at, is_placeholder")
      .in("shop_id", shopIds)
      .eq("status", "publish")
      .order("published_at", { ascending: false }),
    chosenReelIds.length
      ? supabase
          .from("locapass_reels")
          .select("id, shop_id, video_url, preview_url")
          .in("id", chosenReelIds)
          .eq("status", "publish")
          .eq("reel_type", "permanent")
      : Promise.resolve({
          data: [] as { id: string; shop_id: string | null; video_url: string | null; preview_url: string | null }[],
        }),
    // 公開用ビュー(個人情報を含まない・公開中店舗のキャストだけ)。
    supabase.from("locapass_public_casts").select("id, name, shop_id").in("shop_id", shopIds),
  ]);

  const reelCountByShopId = new Map<string, number>();
  // 並び順には、店が実際に投稿したリール(仮のイメージリールを除く)の本数を使う。
  const realReelCountByShopId = new Map<string, number>();
  const latestVideoByShopId = new Map<string, string>();
  // 表紙もアイコンも無い店の代わりに使う、最新の通常リールの静止画。
  const latestStillByShopId = new Map<string, string>();
  for (const r of reelRows ?? []) {
    if (!r.shop_id) continue;
    reelCountByShopId.set(r.shop_id, (reelCountByShopId.get(r.shop_id) ?? 0) + 1);
    if (!r.is_placeholder) realReelCountByShopId.set(r.shop_id, (realReelCountByShopId.get(r.shop_id) ?? 0) + 1);
    if (r.reel_type === "permanent" && !latestStillByShopId.has(r.shop_id)) {
      const still = reelStillUrl(r);
      if (still) latestStillByShopId.set(r.shop_id, still);
    }
    if (r.reel_type === "permanent" && r.video_url && !latestVideoByShopId.has(r.shop_id)) {
      latestVideoByShopId.set(r.shop_id, r.preview_url ?? r.video_url);
    }
  }
  const chosenVideoByShopId = new Map<string, string>();
  for (const r of chosenReels ?? []) {
    const url = r.preview_url ?? r.video_url;
    if (r.shop_id && url) chosenVideoByShopId.set(r.shop_id, url);
  }

  const casts = (castRows ?? []).filter(
    (c): c is typeof c & { id: string; shop_id: string } => c.id !== null && c.shop_id !== null,
  );
  const castIds = casts.map((c) => c.id);
  const [{ data: mediaRows }, { data: scheduleRows }] = await Promise.all([
    castIds.length
      ? supabase
          .from("locapass_media")
          .select("cast_id, url, display_order")
          .in("cast_id", castIds)
          .order("display_order", { ascending: true })
      : Promise.resolve({ data: [] as { cast_id: string | null; url: string; display_order: number }[] }),
    castIds.length
      ? supabase
          .from("locapass_schedules")
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
      name: c.name ?? "",
      avatarUrl: avatarByCastId.get(c.id) ?? null,
      isWorkingNow: workingCastIds.has(c.id),
    });
    castsByShopId.set(c.shop_id, list);
  }

  const venues: VenueCardData[] = shops.map((s) => {
    const videoUrl = s.map_video_enabled
      ? (chosenVideoByShopId.get(s.id) ?? latestVideoByShopId.get(s.id) ?? null)
      : null;
    const heroImage = s.hero_media_url && s.hero_media_type === "image" ? s.hero_media_url : null;
    return {
      id: s.id,
      name: s.name,
      slug: s.slug,
      portalSlug: s.portal!.slug,
      area: s.area ?? null,
      genre: s.category,
      location: {
        lat: s.lat as number,
        lng: s.lng as number,
        addressEn: s.address_en ?? undefined,
      },
      distanceMeter: Math.round(s.distance),
      previewVideoUrl: videoUrl,
      // 写真が無い店は、最新リールの静止画を、表示サイズに合わせた軽い版にして使う。
      imageUrl: heroImage ?? s.cover_url ?? s.icon_url ?? gridThumb(latestStillByShopId.get(s.id), 720) ?? latestStillByShopId.get(s.id) ?? null,
      imageAttribution:
        !heroImage && isPlacePhotoUrl(s.cover_url)
          ? (s.cover_image_attribution as { name?: string; uri?: string | null } | null)
          : null,
      reelCount: reelCountByShopId.get(s.id) ?? 0,
      isSponsored: false,
      sponsoredRank: undefined,
      supportsEnglish: false,
      isVerified: false,
      casts: (castsByShopId.get(s.id) ?? []).slice(0, 6),
      ...((s as { spot?: VenueCardData["spot"] }).spot ? { spot: (s as { spot?: VenueCardData["spot"] }).spot } : {}),
    };
  });

  // 実際に投稿したリールの多い順。同じ本数のときは、写真のある店を先にする(写真が無くて黒い/イメージ写真のカードは後ろへ)。
  venues.sort(
    (a, b) =>
      (realReelCountByShopId.get(b.id) ?? 0) - (realReelCountByShopId.get(a.id) ?? 0) ||
      Number(hasRealPhoto(b.imageUrl)) - Number(hasRealPhoto(a.imageUrl)),
  );

  return venues;
}
