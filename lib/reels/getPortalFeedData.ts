import { createClient } from "@/lib/supabase/server";
import type { ReelItem, AdItem, ShopGridItem } from "@/lib/reels/types";

type ReelRow = {
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
};

function toReelItem(row: ReelRow): ReelItem | null {
  const shop = Array.isArray(row.locapass_shops) ? row.locapass_shops[0] : row.locapass_shops;
  if (!shop || !row.shop_id) return null;

  // 動画が無いリールはimages配列を使うが、WordPress取込データはimagesが空でも
  // poster_urlだけに静止画が入っているケースが多いため、その場合はposter_urlを画像として使う。
  const images = (row.images as { url: string }[] | null) ?? [];
  const media: ReelItem["media"] = row.video_url
    ? [{ type: "video", url: row.video_url, poster: row.poster_url ?? undefined }]
    : images.length > 0
      ? images.map((img) => ({ type: "image", url: img.url }))
      : row.poster_url
        ? [{ type: "image", url: row.poster_url }]
        : [];

  return {
    id: row.id,
    caption: null, // トップページのグリッド/リール一覧では未使用のため取得しない
    media,
    likesCount: row.like_count,
    castId: null, // locapass_reelsはキャスト概念を持たないため常にnull
    castName: row.author_name ?? shop.name,
    castAvatarUrl: row.author_icon_url,
    shopId: row.shop_id,
    shopName: shop.name,
    area: null, // locapass_shopsに店舗単位のエリア列は無い(エリアはsite_idで分かれる)
    address: shop.address,
    genre: shop.category,
    linkUrl: row.action_url,
    createdAt: row.published_at ?? row.updated_at,
    isCommentsEnabled: false, // locapass_reelsにはコメント機能の受け皿が無い
  };
}

const REEL_SELECT =
  "id, video_url, images, poster_url, like_count, shop_id, author_name, author_icon_url, action_url, published_at, updated_at, locapass_shops!locapass_reels_shop_id_fkey ( name, address, category )";

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
    .select("id, name, address, category, icon_url, cover_url")
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (siteId !== null) shopsQuery = shopsQuery.eq("site_id", siteId);

  let reelsQuery = supabase
    .from("locapass_reels")
    .select(REEL_SELECT)
    .eq("status", "publish")
    .or("expires_at.is.null,expires_at.gt.now()")
    .order("published_at", { ascending: false })
    .limit(40);
  if (siteId !== null) reelsQuery = reelsQuery.eq("site_id", siteId);

  const [{ data: shops }, { data: reelRows }, { data: adRows }] = await Promise.all([
    shopsQuery,
    reelsQuery,
    // システム管理者が投稿するPR。指定頻度でリールフィードに紛れ込ませる(システム管理者のみ投稿可)。
    supabase
      .from("ads")
      .select("id, title, media_type, media_url, poster_url, link_url, frequency")
      .eq("is_active", true),
  ]);

  const reels: ReelItem[] = (reelRows ?? []).flatMap((row) => toReelItem(row) ?? []);

  const shopItems: ShopGridItem[] = (shops ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    area: null, // locapass_shopsに店舗単位のエリア列は無い(エリアはsite_idで分かれる)
    address: s.address,
    genre: s.category,
    coverImageUrl: s.cover_url ?? s.icon_url,
  }));

  const genreChoices = Array.from(
    new Set((shops ?? []).map((s) => s.category).filter((g): g is string => !!g)),
  );

  const ads: AdItem[] = (adRows ?? []).map((a) => ({
    id: a.id,
    title: a.title,
    media: { type: a.media_type as "video" | "image", url: a.media_url, poster: a.poster_url },
    linkUrl: a.link_url,
    frequency: a.frequency,
  }));

  return { reels, shopItems, genreChoices, ads };
}
