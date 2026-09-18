import { NextResponse, type NextRequest } from "next/server";
import { createStaticClient } from "@/lib/supabase/static";
import { VENUE_CACHE_HEADERS } from "@/lib/map/cacheHeaders";
import type { ReelItem } from "@/lib/reels/types";

/** 1店舗ぶんの上限。マップからの全画面リールで一度に流す本数。 */
const MAX_REELS_PER_SHOP = 30;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * マップのカードから開く全画面リール用に、1店舗の公開リールだけを返す。
 * ストーリー(フォロワー限定)は含めない。公開情報だけなのでcookie非依存で引き、CDNキャッシュする。
 * 店舗のリールを見終わったら、クライアントが隣の店舗のぶんをこのAPIで追加取得する。
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  if (!UUID_PATTERN.test(shopId)) {
    return NextResponse.json({ error: "invalid shop id" }, { status: 400 });
  }

  const supabase = createStaticClient();
  const { data: rows, error } = await supabase
    .from("reels")
    .select(
      "id, caption, media, likes_count, cast_id, shop_id, link_url, created_at, is_comments_enabled, cast_members ( name, avatar_url ), shop_staff_members ( name, avatar_url ), shops!reels_shop_id_fkey ( name, area, address, genre, status )",
    )
    .eq("shop_id", shopId)
    .eq("status", "published")
    .eq("post_type", "reel")
    .order("created_at", { ascending: false })
    .limit(MAX_REELS_PER_SHOP);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const reels: ReelItem[] = (rows ?? []).flatMap((row) => {
    const shop = Array.isArray(row.shops) ? row.shops[0] : row.shops;
    if (!shop || shop.status !== "active") return [];
    const cast = Array.isArray(row.cast_members) ? row.cast_members[0] : row.cast_members;
    const staff = Array.isArray(row.shop_staff_members) ? row.shop_staff_members[0] : row.shop_staff_members;
    const author = cast ?? staff;
    return [
      {
        id: row.id,
        caption: row.caption,
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
      },
    ];
  });

  return NextResponse.json({ reels }, { headers: VENUE_CACHE_HEADERS });
}
