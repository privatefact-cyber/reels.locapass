import { createClient } from "@/lib/supabase/server";
import { EXCLUDE_OFFICIAL_FILTER } from "@/lib/shop/genres";
import { isPlacePhotoUrl } from "@/components/shop/PlacePhotoCredit";
import type { ReelItem, AdItem, ShopGridItem } from "@/lib/reels/types";
import { latestReelStillsByShop } from "@/lib/map/getVenues";
import { hasRealPhoto, sinkWithoutPhoto } from "@/lib/shop/sinkWithoutPhoto";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { withOriginal, type OriginalText } from "@/lib/i18n/originalText";
import type { Locale } from "@/lib/i18n/locale";
import { toEmbedRef } from "@/lib/embed";
import { sanitizeImageUrl } from "@/lib/utils/sanitize-image-url";
import { FEED_REELS_INITIAL } from "@/lib/reels/feedPaging";

export type ReelRow = {
  id: string;
  caption: string | null;
  translations?: unknown;
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
  locapass_shops:
    | { name: string; address: string | null; category: string | null; slug: string; portal: { slug: string } | { slug: string }[] | null }
    | { name: string; address: string | null; category: string | null; slug: string; portal: { slug: string } | { slug: string }[] | null }[]
    | null;
  cast_id: string | null;
  posted_by_staff_id: string | null;
  is_comments_enabled: boolean;
  thumb_focus_x: number | null;
  thumb_focus_y: number | null;
  embed_provider?: string | null;
  embed_ref?: string | null;
  locapass_cast_members: { name: string | null; avatar_url: string | null; issue_no: number | null } | { name: string | null; avatar_url: string | null; issue_no: number | null }[] | null;
  locapass_shop_staff_members: { name: string; avatar_url: string | null; issue_no: number } | { name: string; avatar_url: string | null; issue_no: number }[] | null;
};

export function toReelItem(row: ReelRow, locale: Locale = "ja"): ReelItem | null {
  const shop = Array.isArray(row.locapass_shops) ? row.locapass_shops[0] : row.locapass_shops;
  const cast = Array.isArray(row.locapass_cast_members) ? row.locapass_cast_members[0] : row.locapass_cast_members;
  const staff = Array.isArray(row.locapass_shop_staff_members)
    ? row.locapass_shop_staff_members[0]
    : row.locapass_shop_staff_members;
  const portal = shop ? (Array.isArray(shop.portal) ? shop.portal[0] : shop.portal) : null;
  if (!shop || !row.shop_id || !portal) return null;

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
    ...captionFields(locale, row),
    media,
    likesCount: row.like_count,
    castId: row.cast_id,
    castName: cast?.name ?? staff?.name ?? row.author_name ?? shop.name,
    castAvatarUrl: sanitizeImageUrl(cast?.avatar_url ?? staff?.avatar_url ?? row.author_icon_url) ?? null,
    shopId: row.shop_id,
    shopName: shop.name,
    shopSlug: shop.slug,
    portalSlug: portal.slug,
    castIssueNo: row.cast_id ? (cast?.issue_no ?? null) : null,
    staffId: row.posted_by_staff_id,
    staffIssueNo: row.posted_by_staff_id ? (staff?.issue_no ?? null) : null,
    area: null, // locapass_shopsに店舗単位のエリア列は無い(エリアはportal_idで分かれる)
    address: shop.address,
    genre: shop.category,
    linkUrl: row.action_url,
    createdAt: row.published_at ?? row.updated_at,
    isCommentsEnabled: row.is_comments_enabled,
    thumbFocus: row.thumb_focus_x == null && row.thumb_focus_y == null ? null : { x: row.thumb_focus_x ?? 50, y: row.thumb_focus_y ?? 50 },
    embed: toEmbedRef(row.embed_provider, row.embed_ref),
  };
}

export const REEL_SELECT =
  "id, caption, translations, video_url, images, poster_url, like_count, shop_id, author_name, author_icon_url, action_url, published_at, updated_at, locapass_shops!locapass_reels_shop_id_fkey ( name, address, category, slug, portal:locapass_portals ( slug ) ), cast_id, posted_by_staff_id, is_comments_enabled, thumb_focus_x, thumb_focus_y, embed_provider, embed_ref, locapass_cast_members:locapass_public_casts ( name, avatar_url, issue_no ), locapass_shop_staff_members ( name, avatar_url, issue_no )";

export type PortalFeedData = {
  reels: ReelItem[];
  /** reelsの先に、まだ取得していないリールがあるか(あれば/api/reels/feedで続きを足す)。 */
  reelsHasMore: boolean;
  shopItems: ShopGridItem[];
  genreChoices: string[];
  ads: AdItem[];
};

/**
 * 公開中リールを新しい順に offset から limit 件取る(siteIdがnullなら全エリア横断)。
 * limit+1件取って、続きがあるか(hasMore)も返す。
 * 並びは published_at → id で固定し、ページをまたいで重複・欠落しないようにする。
 */
export async function getReelPage(
  siteId: number | null,
  offset: number,
  limit: number,
  locale: Locale,
): Promise<{ reels: ReelItem[]; hasMore: boolean }> {
  const supabase = await createClient();
  let query = supabase
    .from("locapass_reels")
    .select(REEL_SELECT)
    .eq("status", "publish")
    .or("expires_at.is.null,expires_at.gt.now()")
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit);
  if (siteId !== null) query = query.eq("portal_id", siteId);

  const { data: rows } = await query;
  const all = rows ?? [];
  const hasMore = all.length > limit;
  const reels = all.slice(0, limit).flatMap((row) => toReelItem(row, locale) ?? []);
  return { reels, hasMore };
}

/**
 * locapass_shops/locapass_reelsから1エリア分(またはsiteIdがnullなら全エリア横断)の
 * フィードデータを取得する。全体トップ(/)と子ポータル(/[prefecture])の両方から呼ぶ。
 */
export async function getPortalFeedData(siteId: number | null): Promise<PortalFeedData> {
  const supabase = await createClient();
  const locale = await getServerLocale();

  let shopsQuery = supabase
    .from("locapass_shops")
    .select("id, name, slug, address, category, icon_url, cover_url, cover_image_attribution, portal:locapass_portals ( slug )")
    .eq("status", "active")
    .or(EXCLUDE_OFFICIAL_FILTER)
    .order("created_at", { ascending: false });
  if (siteId !== null) shopsQuery = shopsQuery.eq("portal_id", siteId);

  const [{ data: shops }, reelPage, { data: adRows }] = await Promise.all([
    shopsQuery,
    // 初回は少なめ(FEED_REELS_INITIAL)だけ渡して描画を速くする。続きはクライアントが
    // /api/reels/feed で足していく(スワイプ・スクロールが末尾に近づいたとき)。
    getReelPage(siteId, 0, FEED_REELS_INITIAL, locale),
    // システム管理者が投稿するPR。指定頻度でリールフィードに紛れ込ませる(システム管理者のみ投稿可)。
    supabase
      .from("locapass_ads")
      .select("id, title, media_type, media_url, poster_url, link_url, frequency")
      .eq("is_active", true),
  ]);

  const { reels, hasMore: reelsHasMore } = reelPage;

  // 表紙もアイコンも無い店は、最新リールの画像をタイルに使う(無ければイメージ写真になり、後ろへ回す)。
  const noOwnPhotoIds = (shops ?? []).filter((s) => !sanitizeImageUrl(s.cover_url ?? s.icon_url)).map((s) => s.id);
  const reelStills = await latestReelStillsByShop(noOwnPhotoIds).catch(() => new Map<string, string>());

  const shopItemsRaw: ShopGridItem[] = (shops ?? []).flatMap((s) => {
    const portal = Array.isArray(s.portal) ? s.portal[0] : s.portal;
    if (!portal) return [];
    return [
      {
        id: s.id,
        name: s.name,
        slug: s.slug,
        portalSlug: portal.slug,
        area: null, // locapass_shopsに店舗単位のエリア列は無い(エリアはportal_idで分かれる)
        address: s.address,
        genre: s.category,
        coverImageUrl: sanitizeImageUrl(s.cover_url ?? s.icon_url) ?? sanitizeImageUrl(reelStills.get(s.id)) ?? null,
        coverAttribution: isPlacePhotoUrl(s.cover_url)
          ? (s.cover_image_attribution as { name?: string; uri?: string | null } | null)
          : null,
      },
    ];
  });

  // 写真のない店(後ろへ)。リールを投稿すると写真ありになり、元の位置に戻る。
  const shopItems = sinkWithoutPhoto(shopItemsRaw, (s) => hasRealPhoto(s.coverImageUrl));

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

  return { reels, reelsHasMore, shopItems, genreChoices, ads };
}

/** 投稿文(表示言語に合わせた翻訳)と、4言語以外の原文のときの「原文を見る」用の原文。 */
export function captionFields(locale: Locale, row: { caption: string | null; translations?: unknown }): { caption: string | null; captionOriginal: OriginalText | null } {
  const c = withOriginal(locale, row.caption, row.translations, "caption");
  return { caption: c.text, captionOriginal: c.original };
}
