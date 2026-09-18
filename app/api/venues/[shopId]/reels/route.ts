import { NextResponse, type NextRequest } from "next/server";
import { createStaticClient } from "@/lib/supabase/static";
import { VENUE_CACHE_HEADERS } from "@/lib/map/cacheHeaders";
import { toReelItem, REEL_SELECT } from "@/lib/reels/getPortalFeedData";
import type { ReelItem } from "@/lib/reels/types";

/** 1店舗ぶんの上限。マップからの全画面リールで一度に流す本数。 */
const MAX_REELS_PER_SHOP = 30;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * マップのカードから開く全画面リール用に、1店舗の公開リールだけを返す。
 * 公開情報だけなのでcookie非依存で引き、CDNキャッシュする。
 * 店舗のリールを見終わったら、クライアントが隣の店舗のぶんをこのAPIで追加取得する。
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  if (!UUID_PATTERN.test(shopId)) {
    return NextResponse.json({ error: "invalid shop id" }, { status: 400 });
  }

  const supabase = createStaticClient();
  const { data: rows, error } = await supabase
    .from("locapass_reels")
    .select(REEL_SELECT)
    .eq("shop_id", shopId)
    .eq("status", "publish")
    .or("expires_at.is.null,expires_at.gt.now()")
    .order("published_at", { ascending: false })
    .limit(MAX_REELS_PER_SHOP);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const reels: ReelItem[] = (rows ?? []).flatMap((row) => toReelItem(row) ?? []);

  return NextResponse.json({ reels }, { headers: VENUE_CACHE_HEADERS });
}
