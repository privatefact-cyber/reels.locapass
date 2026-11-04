import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { createClient } from "@/lib/supabase/server";
import { getNowShopIds } from "@/lib/reels/nowShops";
import { REEL_SELECT, toReelItem } from "@/lib/reels/getPortalFeedData";
import type { ReelItem } from "@/lib/reels/types";

/**
 * NOWタブ用: 今(JST)営業時間内の店舗の、最新リールを店舗ごとに1本ずつ返す。
 * 「営業中」の判定は lib/reels/nowShops.ts(地図の「今」スイッチと共通)。
 * 運営の公式店舗も、営業時間を入れていれば対象にする。siteIdがnullなら全エリア横断。
 */
export async function getNowReels(siteId: number | null): Promise<ReelItem[]> {
  const supabase = await createClient();
  const locale = await getServerLocale();

  const openShopIds = [...(await getNowShopIds(supabase, { portalId: siteId }))];
  if (openShopIds.length === 0) return [];

  const { data: rows } = await supabase
    .from("locapass_reels")
    .select(REEL_SELECT)
    .in("shop_id", openShopIds)
    .eq("status", "publish")
    .or("expires_at.is.null,expires_at.gt.now()")
    .order("published_at", { ascending: false })
    .limit(300);

  // published_at降順で取得済みなので、店舗ごとに最初に出てきたもの(=最新)だけ残す。
  const seen = new Set<string>();
  const out: ReelItem[] = [];
  for (const row of rows ?? []) {
    if (!row.shop_id || seen.has(row.shop_id)) continue;
    const item = toReelItem(row, locale);
    if (!item) continue;
    seen.add(row.shop_id);
    out.push(item);
  }
  return out;
}
