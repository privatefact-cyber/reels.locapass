import { createStaticClient } from "@/lib/supabase/static";
import { PET_ATTRIBUTE_KEYS } from "@/lib/verticals/attributes";

/**
 * 地図のオン・オフのスイッチ(🐾 と「ブースト」)。絞り込みはサーバー側で行う(ピンの上限で欠けないように)。
 * どちらもオフなら絞り込まない。両方オンなら「両方に当てはまる店」。
 */
export type VenueFilters = { pet: boolean; boost: boolean };

export function parseVenueFilters(searchParams: URLSearchParams): VenueFilters {
  return { pet: searchParams.get("pet") === "1", boost: searchParams.get("boost") === "1" };
}

// 属性・ブーストのテーブルは生成済みの型に無いので any で扱う。
type Loose = { from: (t: string) => any };

/** 🐾: 属性「ペット同伴可」「ペット専用」を持つ店。取得に失敗したら空(=何も出さない。絞り込みを黙って外さない)。 */
async function petShopIds(db: Loose): Promise<Set<string>> {
  const { data, error } = await db.from("locapass_shop_attributes").select("shop_id").in("attribute_key", [...PET_ATTRIBUTE_KEYS]).limit(10000);
  if (error) return new Set();
  return new Set(((data ?? []) as { shop_id: string }[]).map((r) => r.shop_id));
}

/**
 * いまブースト中の店。ブーストは営業中に出すものなので「営業中」の判定は別に要らない
 * (営業中の店を見たいときはボトムナビのNOW)。地図のピンの目立たせ・カードのバッジにも同じ集合を使う。
 */
export async function getActiveBoostShopIds(db: Loose): Promise<Set<string>> {
  const { data } = await db.from("locapass_boost_posts").select("shop_id").eq("status", "active").gt("expires_at", new Date().toISOString()).limit(1000);
  const ids = new Set<string>();
  for (const b of (data ?? []) as { shop_id: string | null }[]) if (b.shop_id) ids.add(b.shop_id);
  return ids;
}

/**
 * スイッチに当てはまる店舗IDの集合。スイッチがどれもオフなら null(絞り込みなし)。
 * 地図の取得はすべて公開情報だけなので、cookieに依存しないクライアントで引く(getVenues.ts と同じ)。
 */
export async function getVenueFilterIds(filters: VenueFilters): Promise<Set<string> | null> {
  if (!filters.pet && !filters.boost) return null;
  const db = createStaticClient() as unknown as Loose;
  const [pet, boost] = await Promise.all([filters.pet ? petShopIds(db) : null, filters.boost ? getActiveBoostShopIds(db) : null]);
  if (pet && boost) return new Set([...pet].filter((id) => boost.has(id)));
  return pet ?? boost;
}
