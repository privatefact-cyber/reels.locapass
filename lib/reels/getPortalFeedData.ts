import { createClient } from "@/lib/supabase/server";
import { EXCLUDE_OFFICIAL_FILTER } from "@/lib/shop/genres";
import { isPlacePhotoUrl } from "@/components/shop/PlacePhotoCredit";
import type { ReelItem, AdItem, ShopGridItem } from "@/lib/reels/types";
import { sanitizeImageUrl } from "@/lib/utils/sanitize-image-url";

export type ReelRow = {
  id: string;
  video_url: string | null;
  images: unknown;
  poster_url: string | null;
  like_count: number;
  shop_id: string | null;
  author_name: string | null;
  author_icon_url: string | null;
  action_url: string | null;
  published_at: string | null;
  updated_at: string;
  locapass_shops: { name: string; address: string | null; category: string | null } | { name: string; address: string | null; category: string | null }[] | null;
  cast_id: string | null;
  is_comments_enabled: boolean;
  locapass_cast_members: { name: string | null; avatar_url: string | null } | { name: string | null; avatar_url: string | null }[] | null;
  locapass_shop_staff_members: { name: string; avatar_url: string | null } | { name: string; avatar_url: string | null }[] | null;
};

export function toReelItem(row: ReelRow): ReelItem | null {
  const shop = Array.isArray(row.locapass_shops) ? row.locapass_shops[0] : row.locapass_shops;
  const cast = Array.isArray(row.locapass_cast_members) ? row.locapass_cast_members[0] : row.locapass_cast_members;
  const staff = Array.isArray(row.locapass_shop_staff_members)
    ? row.locapass_shop_staff_members[0]
    : row.locapass_shop_staff_members;
  if (!shop || !row.shop_id) return null;

  // 動画が無いリールはimages配列を使うが、WordPress取込データはimagesが空でも
  // poster_urlだけに静止画が入っているケースが多いため、その場合はposter_urlを画像として使う。
  // sanitizeImageUrlがundefinedを返した(=画像なし/壊れたURL)ものは、代替画像を
  // 差し込まずそのまま除外する(mediaが空ならLOCAPASSロゴのCSSプレースホルダーになる)。
  const posterUrl = sanitizeImageUrl(row.poster_url);
  const sanitizedImages = (row.images as { url: string }[] | null ?? [])
    .map((img) => sanitizeImageUrl(img.url))
    .filter((url): url is string => Boolean(url));
  const media: ReelItem["media"] = row.video_url
    ? [{ type: "video", url: row.video_url, poster: posterUrl }]
    : sanitizedImages.length > 0
      ? sanitizedImages.map((url) => ({ type: "image", url }))
      : posterUrl
        ? [{ type: "image", url: posterUrl }]
        : [];

  return {
    id: row.id,
    caption: null, // トップページのグリッド/リール一覧では未使用のため取得しない
    media,
    likesCount: row.like_count,
    castId: row.cast_id,
    castName: cast?.name ?? staff?.name ?? row.author_name ?? shop.name,
    castAvatarUrl: sanitizeImageUrl(cast?.avatar_url ?? staff?.avatar_url ?? row.author_icon_url) ?? null,
    shopId: row.shop_id,
    shopName: shop.name,
    area: null, // locapass_shopsに店舗単位のエリア列は無い(エリアはportal_idで分かれる)
    address: shop.address,
    genre: shop.category,
    linkUrl: row.action_url,
    createdAt: row.published_at ?? row.updated_at,
    isCommentsEnabled: row.is_comments_enabled,
  };
}

export const REEL_SELECT =
  "id, video_url, images, poster_url, like_count, shop_id, author_name, author_icon_url, action_url, published_at, updated_at, locapass_shops!locapass_reels_shop_id_fkey ( name, address, category ), cast_id, is_comments_enabled, locapass_cast_members:locapass_public_casts ( name, avatar_url ), locapass_shop_staff_members ( name, avatar_url )";

export type PortalFeedData = {
  reels: ReelItem[];
  shopItems: ShopGridItem[];
  genreChoices: string[];
  ads: AdItem[];
};

/**
 * locapass_shops/locapass_reelsから1エリア分(またはsiteIdがnullなら全エリア横断)の
 * フィードデータを取得する。全体トップ(/)と子ポータル(/[prefecture])の両方から呼ぶ。
 */
export async function getPortalFeedData(siteId: number | null): Promise<PortalFeedData> {
  const supabase = await createClient();

  let shopsQuery = supabase
    .from("locapass_shops")
    .select("id, name, address, category, icon_url, cover_url, cover_image_attribution")
    .eq("status", "active")
    .or(EXCLUDE_OFFICIAL_FILTER)
    .order("created_at", { ascending: false });
  if (siteId !== null) shopsQuery = shopsQuery.eq("portal_id", siteId);

  let reelsQuery = supabase
    .from("locapass_reels")
    .select(REEL_SELECT)
    .eq("status", "publish")
    .or("expires_at.is.null,expires_at.gt.now()")
    .order("published_at", { ascending: false })
    .limit(40);
  if (siteId !== null) reelsQuery = reelsQuery.eq("portal_id", siteId);

  const [{ data: shops }, { data: reelRows }, { data: adRows }] = await Promise.all([
    shopsQuery,
    reelsQuery,
    // システム管理者が投稿するPR。指定頻度でリールフィードに紛れ込ませる(システム管理者のみ投稿可)。
    supabase
      .from("locapass_ads")
      .select("id, title, media_type, media_url, poster_url, link_url, frequency")
      .eq("is_active", true),
  ]);

  const reels: ReelItem[] = (reelRows ?? []).flatMap((row) => toReelItem(row) ?? []);

  const shopItems: ShopGridItem[] = (shops ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    area: null, // locapass_shopsに店舗単位のエリア列は無い(エリアはportal_idで分かれる)
    address: s.address,
    genre: s.category,
    coverImageUrl: sanitizeImageUrl(s.cover_url ?? s.icon_url) ?? null,
    coverAttribution: isPlacePhotoUrl(s.cover_url)
      ? (s.cover_image_attribution as { name?: string; uri?: string | null } | null)
      : null,
  }));

  const genreChoices = Array.from(
    new Set((shops ?? []).map((s) => s.category).filter((g): g is string => !!g)),
  );

  const ads: AdItem[] = (adRows ?? []).map((a) => ({
    id: a.id,
    title: a.title,
    media: { type: a.media_type as "video" | "image", url: a.media_url, poster: sanitizeImageUrl(a.poster_url) },
    linkUrl: a.link_url,
    frequency: a.frequency,
  }));

  return { reels, shopItems, genreChoices, ads };
}
