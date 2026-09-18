import { createClient } from "@/lib/supabase/server";
import { ReelFeed, type ReelItem } from "@/components/ReelFeed";
import { FeaturedSection } from "@/components/home/FeaturedSection";
import { getFeaturedShops } from "@/lib/shop/getFeaturedShops";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import type { AdItem, ShopGridItem } from "@/lib/reels/types";
import { siteConfig } from "@/config/site";

export const revalidate = 60;

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

  const media: ReelItem["media"] = row.video_url
    ? [{ type: "video", url: row.video_url, poster: row.poster_url ?? undefined }]
    : ((row.images as { url: string }[]) ?? []).map((img) => ({ type: "image", url: img.url }));

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
    area: null, // locapass_shopsに店舗単位のエリア列は無い(サイト自体が水戸単位のため)
    address: shop.address,
    genre: shop.category,
    linkUrl: row.action_url,
    createdAt: row.published_at ?? row.updated_at,
    isCommentsEnabled: false, // locapass_reelsにはコメント機能の受け皿が無い
  };
}

const REEL_SELECT =
  "id, video_url, images, poster_url, like_count, shop_id, author_name, author_icon_url, action_url, published_at, updated_at, locapass_shops!locapass_reels_shop_id_fkey ( name, address, category )";

export default async function TopPage() {
  const supabase = await createClient();
  const locale = await getServerLocale();
  const featuredShops = await getFeaturedShops(locale);
  const targetSiteId = siteConfig.targetSiteId;

  // locapass_reels/locapass_shopsにはキャスト稼働スケジュールの概念が無いため、
  // NOWタブは常に空(受け皿はUI側に残るが、対応データが無い)。
  const nowReels: ReelItem[] = [];

  const [{ data: shops }, { data: reelRows }, { data: adRows }] = await Promise.all([
    supabase
      .from("locapass_shops")
      .select("id, name, address, category, icon_url, cover_url")
      .eq("status", "active")
      .eq("site_id", targetSiteId)
      .order("created_at", { ascending: false }),
    supabase
      .from("locapass_reels")
      .select(REEL_SELECT)
      .eq("status", "publish")
      .eq("site_id", targetSiteId)
      .or("expires_at.is.null,expires_at.gt.now()")
      .order("published_at", { ascending: false })
      .limit(40),
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
    area: null, // locapass_shopsに店舗単位のエリア列は無い(サイト自体が水戸単位のため)
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

  return (
    <div className="space-y-4">
      {/* トップの提携店舗特集(FEATURED)。運営がshops.featured_rankで選んだ店舗だけを、
          黒×ゴールドのコンパクトな見せ方で出す。1件も無ければ/×で閉じたら何も表示しない。 */}
      <FeaturedSection shops={featuredShops} />

      {/* リールフィード（検索・タグ絞り込み付き）。CASTタブはキャストが投稿したリール、
          SHOPタブは店舗のトップサムネイル（縦型メイン画像）グリッド。NOWは今まさに稼働中の
          キャストの最新リール1本ずつのみを表示する。
          「本日の出勤」の一覧は店舗詳細ページ、フォロー中のみの出勤状況はマイページで
          それぞれ表示する(トップでは全キャスト分を出すと件数に上限がないため扱わない)。
          adsはシステム管理者が投稿するPRで、指定頻度でグリッド/リール一覧の両方に紛れ込ませる。 */}
      <ReelFeed reels={reels} nowReels={nowReels} shops={shopItems} genreChoices={genreChoices} ads={ads} />
    </div>
  );
}
