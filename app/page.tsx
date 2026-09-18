import { createClient } from "@/lib/supabase/server";
import { ReelFeed, type ReelItem } from "@/components/ReelFeed";
import { FeaturedSection } from "@/components/home/FeaturedSection";
import { getFeaturedShops } from "@/lib/shop/getFeaturedShops";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import type { AdItem, ShopGridItem } from "@/lib/reels/types";
import { getJstNow, isWithinWorkingWindow, toJstDateString } from "@/lib/reels/nowWorking";
import { siteConfig } from "@/config/site";

export const revalidate = 60;

type ReelRow = {
  id: string;
  media: unknown;
  likes_count: number;
  cast_id: string | null;
  shop_id: string;
  link_url: string | null;
  created_at: string;
  is_comments_enabled: boolean;
  cast_members: { name: string; avatar_url: string | null } | { name: string; avatar_url: string | null }[] | null;
  shop_staff_members: { name: string; avatar_url: string | null } | { name: string; avatar_url: string | null }[] | null;
  shops: { name: string; area: string | null; address: string | null; genre: string | null } | { name: string; area: string | null; address: string | null; genre: string | null }[] | null;
};

function toReelItem(row: ReelRow): ReelItem | null {
  const cast = Array.isArray(row.cast_members) ? row.cast_members[0] : row.cast_members;
  const staff = Array.isArray(row.shop_staff_members) ? row.shop_staff_members[0] : row.shop_staff_members;
  const author = cast ?? staff;
  const shop = Array.isArray(row.shops) ? row.shops[0] : row.shops;
  if (!shop) return null;
  return {
    id: row.id,
    caption: null, // トップページのグリッド/リール一覧では未使用のため取得しない
    media: (row.media as ReelItem["media"]) ?? [],
    likesCount: row.likes_count,
    castId: row.cast_id,
    castName: author?.name ?? shop.name,
    castAvatarUrl: author?.avatar_url ?? null,
    shopId: row.shop_id,
    shopName: shop.name,
    area: shop.area,
    address: shop.address,
    genre: shop.genre,
    linkUrl: row.link_url,
    createdAt: row.created_at,
    isCommentsEnabled: row.is_comments_enabled,
  };
}

const REEL_SELECT =
  "id, media, likes_count, cast_id, shop_id, link_url, created_at, is_comments_enabled, cast_members ( name, avatar_url ), shop_staff_members ( name, avatar_url ), shops!reels_shop_id_fkey ( name, area, address, genre )";
// shops と reels の間には「リールの所属店舗(reels.shop_id)」と「店舗が選んだマップカード用リール
// (shops.map_preview_reel_id)」の2本の外部キーがあるので、埋め込みでは使うキーを明示する。
// 明示しないとPostgRESTが「関係が複数ある」エラーを返し、フィードが空になる。

export default async function TopPage() {
  const supabase = await createClient();
  const locale = await getServerLocale();
  const featuredShops = await getFeaturedShops(locale);
  const targetArea = siteConfig.targetArea;

  const jstNow = getJstNow();
  const todayStr = toJstDateString(jstNow);
  const yesterday = new Date(jstNow);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = toJstDateString(yesterday);

  const [{ data: shops }, { data: reelRows }, { data: scheduleWindows }, { data: adRows }] =
    await Promise.all([
      supabase
        .from("shops")
        .select("id, name, area, address, genre, cover_image_url")
        .eq("status", "active")
        .eq("area", targetArea)
        .order("created_at", { ascending: false }),
      // ストーリー(フォロワー限定・24時間)はRLS上フォロワーやキャスト本人には読めてしまうので、
      // 公開リールだけに明示的に絞る。
      supabase
        .from("reels")
        .select(REEL_SELECT)
        .eq("status", "published")
        .eq("post_type", "reel")
        .eq("area", targetArea)
        .order("created_at", { ascending: false })
        .limit(40),
      // 「今まさに稼働中(出勤前後1時間バッファ込み)」の判定用。深夜跨ぎシフトのため昨日分も取得する。
      supabase
        .from("schedules")
        .select("cast_id, date, start_time, end_time")
        .in("date", [yesterdayStr, todayStr])
        .eq("is_working_today", true)
        .not("start_time", "is", null)
        .not("end_time", "is", null),
      // システム管理者が投稿するPR。指定頻度でリールフィードに紛れ込ませる(システム管理者のみ投稿可)。
      supabase
        .from("ads")
        .select("id, title, media_type, media_url, poster_url, link_url, frequency")
        .eq("is_active", true),
    ]);

  const reels: ReelItem[] = (reelRows ?? []).flatMap((row) => toReelItem(row) ?? []);

  const workingCastIds = Array.from(
    new Set(
      (scheduleWindows ?? [])
        .filter((w): w is typeof w & { start_time: string; end_time: string } => !!w.start_time && !!w.end_time)
        .filter((w) =>
          isWithinWorkingWindow(
            { date: w.date, startTime: w.start_time, endTime: w.end_time },
            todayStr,
            yesterdayStr,
            jstNow,
          ),
        )
        .map((w) => w.cast_id)
        .filter((id): id is string => !!id),
    ),
  );

  let nowReels: ReelItem[] = [];
  if (workingCastIds.length > 0) {
    const { data: nowReelRows } = await supabase
      .from("reels")
      .select(REEL_SELECT)
      .in("cast_id", workingCastIds)
      .eq("status", "published")
      .eq("post_type", "reel")
      .eq("area", targetArea)
      .order("created_at", { ascending: false });

    // キャストごとに最新の1本だけ残す(created_at降順で取得済みなので最初に出てきたものを採用)。
    const seenCastIds = new Set<string>();
    for (const row of nowReelRows ?? []) {
      if (!row.cast_id || seenCastIds.has(row.cast_id)) continue;
      const item = toReelItem(row);
      if (!item) continue;
      seenCastIds.add(row.cast_id);
      nowReels.push(item);
    }
  }

  const shopItems: ShopGridItem[] = (shops ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    area: s.area,
    address: s.address,
    genre: s.genre,
    coverImageUrl: s.cover_image_url,
  }));

  const genreChoices = Array.from(
    new Set((shops ?? []).map((s) => s.genre).filter((g): g is string => !!g)),
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
