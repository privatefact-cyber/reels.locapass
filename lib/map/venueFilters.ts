import { createStaticClient } from "@/lib/supabase/static";
import type { VenueBounds } from "@/lib/map/getVenues";
import { getNowShopIds } from "@/lib/reels/nowShops";
import { PET_ATTRIBUTE_KEYS } from "@/lib/verticals/attributes";

/**
 * 地図のオン・オフのスイッチ(🐾 と「今」)。絞り込みはサーバー側で行う(ピンの上限で欠けないように)。
 * どちらもオフなら絞り込まない。両方オンなら「両方に当てはまる店」。
 */
export type VenueFilters = { pet: boolean; now: boolean };

export function parseVenueFilters(searchParams: URLSearchParams): VenueFilters {
  return { pet: searchParams.get("pet") === "1", now: searchParams.get("now") === "1" };
}

// 属性・ブーストのテーブルは生成済みの型に無いので any で扱う。
type Loose = { from: (t: string) => any };

/** 🐾: 属性「ペット同伴可」「ペット専用」を持つ店。取得に失敗したら空(=何も出さない。絞り込みを黙って外さない)。 */
async function petShopIds(db: Loose): Promise<Set<string>> {
  const { data, error } = await db.from("locapass_shop_attributes").select("shop_id").in("attribute_key", [...PET_ATTRIBUTE_KEYS]).limit(10000);
  if (error) return new Set();
  return new Set(((data ?? []) as { shop_id: string }[]).map((r) => r.shop_id));
}

/** 今: NOW(営業時間内・出店中の移動販売。lib/reels/nowShops.ts)に、いまブースト中の店を足したもの。 */
async function nowShopIds(db: Loose, bounds: VenueBounds): Promise<Set<string>> {
  const [open, { data: boosts }] = await Promise.all([
    getNowShopIds(db, { bounds }),
    db.from("locapass_boost_posts").select("shop_id").eq("status", "active").gt("expires_at", new Date().toISOString()).limit(1000),
  ]);
  for (const b of (boosts ?? []) as { shop_id: string | null }[]) if (b.shop_id) open.add(b.shop_id);
  return open;
}

/**
 * スイッチに当てはまる店舗IDの集合。スイッチがどれもオフなら null(絞り込みなし)。
 * 地図の取得はすべて公開情報だけなので、cookieに依存しないクライアントで引く(getVenues.ts と同じ)。
 */
export async function getVenueFilterIds(bounds: VenueBounds, filters: VenueFilters): Promise<Set<string> | null> {
  if (!filters.pet && !filters.now) return null;
  const db = createStaticClient() as unknown as Loose;
  const [pet, now] = await Promise.all([filters.pet ? petShopIds(db) : null, filters.now ? nowShopIds(db, bounds) : null]);
  if (pet && now) return new Set([...pet].filter((id) => now.has(id)));
  return pet ?? now;
}
