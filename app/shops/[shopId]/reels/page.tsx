import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ReelLoopFeed } from "@/components/ReelLoopFeed";
import type { ReelItem } from "@/lib/reels/types";

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
    .from("shops")
    .select("id, name, area, address, genre")
    .eq("id", shopId)
    .single();

  if (shopError && shopError.code !== "PGRST116") {
    throw new Error(`shops取得に失敗しました: ${shopError.message}`);
  }

  if (!shop) {
    notFound();
  }

  // 店舗の全リール(キャスト個人の投稿+スタッフ投稿の両方)をまとめて流す。
  const { data: reelRows } = await supabase
    .from("reels")
    .select(
      "id, caption, media, likes_count, cast_id, shop_id, link_url, created_at, is_comments_enabled, posted_by_staff_id, cast_members ( name, avatar_url ), shop_staff_members ( name, avatar_url )",
    )
    .eq("shop_id", shopId)
    .eq("status", "published")
    // ストーリーはRLS上フォロワーには読めるので、リール再生に混ざらないよう明示的に除外する。
    .eq("post_type", "reel")
    .order("created_at", { ascending: false });

  const reels: ReelItem[] = (reelRows ?? []).map((row) => {
    const cast = Array.isArray(row.cast_members) ? row.cast_members[0] : row.cast_members;
    const staff = Array.isArray(row.shop_staff_members)
      ? row.shop_staff_members[0]
      : row.shop_staff_members;
    return {
      id: row.id,
      caption: row.caption,
      media: (row.media as ReelItem["media"]) ?? [],
      likesCount: row.likes_count,
      castId: row.cast_id,
      castName: cast?.name ?? staff?.name ?? shop.name,
      castAvatarUrl: cast?.avatar_url ?? staff?.avatar_url ?? null,
      shopId: row.shop_id,
      shopName: shop.name,
      area: shop.area,
      address: shop.address,
      genre: shop.genre,
      linkUrl: row.link_url,
      createdAt: row.created_at,
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
