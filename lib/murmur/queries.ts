import { MURMUR_PAGE_SIZE, MURMUR_VISIBLE_DAYS } from "@/lib/murmur/config";

export type MurmurItem = {
  id: string;
  body: string;
  imageUrl: string | null;
  createdAt: string;
  shopId: string;
  shopName: string;
  shopSlug: string;
  shopIconUrl: string | null;
  portalSlug: string;
};

type Db = { from: (t: string) => any };

const SELECT =
  "id, body, image_url, created_at, shop_id, locapass_shops ( name, slug, icon_url, portal_id, portal:locapass_portals ( slug ) )";

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

function toItem(row: any): MurmurItem | null {
  const shop = one<any>(row.locapass_shops);
  const portal = one<any>(shop?.portal);
  if (!shop || !portal?.slug || !shop.slug) return null;
  return {
    id: row.id,
    body: row.body,
    imageUrl: row.image_url ?? null,
    createdAt: row.created_at,
    shopId: row.shop_id,
    shopName: shop.name,
    shopSlug: shop.slug,
    shopIconUrl: shop.icon_url ?? null,
    portalSlug: portal.slug,
  };
}

/** 店舗ページに出す、直近 MURMUR_VISIBLE_DAYS 日の最新1件。なければ null。 */
export async function getLatestMurmur(db: Db, shopId: string): Promise<MurmurItem | null> {
  const since = new Date(Date.now() - MURMUR_VISIBLE_DAYS * 86400_000).toISOString();
  const { data, error } = await db
    .from("locapass_shop_murmurs")
    .select(SELECT)
    .eq("shop_id", shopId)
    .is("deleted_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    console.error("getLatestMurmur", error.message);
    return null;
  }
  return data?.[0] ? toItem(data[0]) : null;
}

/** 店ごとの一覧(新しい順)。 */
export async function listShopMurmurs(db: Db, shopId: string, page: number): Promise<{ items: MurmurItem[]; total: number }> {
  const from = (page - 1) * MURMUR_PAGE_SIZE;
  const { data, count, error } = await db
    .from("locapass_shop_murmurs")
    .select(SELECT, { count: "exact" })
    .eq("shop_id", shopId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, from + MURMUR_PAGE_SIZE - 1);
  if (error) throw new Error(`ひとこと一覧の取得に失敗しました: ${error.message}`);
  return { items: ((data ?? []) as any[]).map(toItem).filter((x): x is MurmurItem => !!x), total: count ?? 0 };
}

/** ポータルごとのタイムライン。portalId が null のときは全ポータル(ロカパス全体)。 */
export async function listPortalMurmurs(db: Db, portalId: number | null, page: number): Promise<{ items: MurmurItem[]; total: number }> {
  const from = (page - 1) * MURMUR_PAGE_SIZE;
  let q = db
    .from("locapass_shop_murmurs")
    .select(portalId == null ? SELECT : SELECT.replace("locapass_shops (", "locapass_shops!inner ("), { count: "exact" })
    .is("deleted_at", null);
  if (portalId != null) q = q.eq("locapass_shops.portal_id", portalId);
  const { data, count, error } = await q.order("created_at", { ascending: false }).range(from, from + MURMUR_PAGE_SIZE - 1);
  if (error) throw new Error(`タイムラインの取得に失敗しました: ${error.message}`);
  return { items: ((data ?? []) as any[]).map(toItem).filter((x): x is MurmurItem => !!x), total: count ?? 0 };
}

/** トップに出す、最新のVOICE(新しい順に、少数)。portalId が null のときは全ポータル。 */
export async function listLatestMurmurs(db: Db, portalId: number | null, limit = 3): Promise<MurmurItem[]> {
  let q = db
    .from("locapass_shop_murmurs")
    .select(portalId == null ? SELECT : SELECT.replace("locapass_shops (", "locapass_shops!inner ("))
    .is("deleted_at", null);
  if (portalId != null) q = q.eq("locapass_shops.portal_id", portalId);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
  if (error) {
    console.error("listLatestMurmurs", error.message);
    return [];
  }
  return ((data ?? []) as any[]).map(toItem).filter((x): x is MurmurItem => !!x);
}
