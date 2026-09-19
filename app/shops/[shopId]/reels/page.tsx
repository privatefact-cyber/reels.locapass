import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ReelLoopFeed } from "@/components/ReelLoopFeed";
import type { ReelItem } from "@/lib/reels/types";
import { LOCAPASS_REEL_MEDIA_SELECT, toReelMedia } from "@/lib/reels/locapassReelMedia";

export const revalidate = 60;

export default async function ShopReelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{ start?: string }>;
}) {
  const { shopId } = await params;
  const { start } = await searchParams;
  const supabase = await createClient();

  const { data: shop, error: shopError } = await supabase
    .from("locapass_shops")
    .select("id, name, area, address, genre:category")
    .eq("id", shopId)
    .single();

  if (shopError && shopError.code !== "PGRST116") {
    throw new Error(`locapass_shops取得に失敗しました: ${shopError.message}`);
  }

  if (!shop) {
    notFound();
  }

  // 店舗の全リール(キャスト個人の投稿+スタッフ投稿の両方)をまとめて流す。
  const { data: reelRows } = await supabase
    .from("locapass_reels")
    .select(
      `id, caption, ${LOCAPASS_REEL_MEDIA_SELECT}, like_count, cast_id, shop_id, action_url, published_at, updated_at, is_comments_enabled, posted_by_staff_id, author_name, author_icon_url, cast_members:locapass_public_casts ( name, avatar_url ), shop_staff_members:locapass_shop_staff_members ( name, avatar_url )`,
    )
    .eq("shop_id", shopId)
    .eq("status", "publish")
    // ストーリー(24時間)はリール再生に混ざらないよう明示的に除外する。
    .eq("reel_type", "permanent")
    .order("published_at", { ascending: false });

  const reels: ReelItem[] = (reelRows ?? []).map((row) => {
    const cast = Array.isArray(row.cast_members) ? row.cast_members[0] : row.cast_members;
    const staff = Array.isArray(row.shop_staff_members)
      ? row.shop_staff_members[0]
      : row.shop_staff_members;
    return {
      id: row.id,
      caption: row.caption,
      media: toReelMedia(row),
      likesCount: row.like_count,
      castId: row.cast_id,
      castName: cast?.name ?? staff?.name ?? row.author_name ?? shop.name,
      castAvatarUrl: cast?.avatar_url ?? staff?.avatar_url ?? row.author_icon_url ?? null,
      shopId: row.shop_id ?? shop.id,
      shopName: shop.name,
      area: shop.area,
      address: shop.address,
      genre: shop.genre,
      linkUrl: row.action_url,
      createdAt: row.published_at ?? row.updated_at,
      isCommentsEnabled: row.is_comments_enabled,
    };
  });

  // ヒーロー直下の横スワイプ帯から特定の投稿をタップして来た場合、その投稿から再生を始める
  // (並び自体は変えず、配列を回転させて対象を先頭に持ってくるだけ)。
  const startIndex = start ? reels.findIndex((r) => r.id === start) : -1;
  const orderedReels =
    startIndex > 0 ? [...reels.slice(startIndex), ...reels.slice(0, startIndex)] : reels;

  return (
    <div className="space-y-3">
      <Link href={`/shops/${shop.id}`} className="inline-block px-1 text-sm text-brand hover:underline">
        ← {shop.name} の店舗ページに戻る
      </Link>
      <ReelLoopFeed reels={orderedReels} />
    </div>
  );
}
