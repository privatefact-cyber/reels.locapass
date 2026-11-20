import { isDemoShop } from "@/lib/seo/demo";
import { isPaidPlan } from "./slot";

/** 「近くのおすすめ」に出す1店舗。sponsored は有料掲載の店(画面に「PR」を付ける)。 */
export type RelatedShop = {
  id: string;
  name: string;
  slug: string;
  portalSlug: string;
  genre: string | null;
  area: string | null;
  coverImageUrl: string | null;
  sponsored: boolean;
};

// 業態・属性の列/テーブルは生成済みの型に無いので any で扱う(lib/verticals/shopAttributes.ts と同じ)。
type Loose = { from: (t: string) => any };

type ShopRow = {
  id: string;
  slug: string;
  name: string;
  plan: string | null;
  category: string | null;
  business_type: string | null;
  cover_url: string | null;
  area: string | null;
  lat: number | null;
  lng: number | null;
};

const COLUMNS = "id, slug, name, plan, category, business_type, cover_url, area, lat, lng";
/** 候補に入れる数。有料の店は全部(上限は念のため)、無料の店は新しい順に。 */
const PAID_CANDIDATES = 60;
const FREE_CANDIDATES = 120;
/** 属性の取得は、URLが長くなりすぎないように分けて引く。 */
const ATTR_CHUNK = 60;
/** 同点の店が毎回同じ順にならないよう、並びを少しだけゆらす幅と、ゆらす時間の単位(1時間)。 */
const JITTER = 1.2;
const ROTATION_MS = 60 * 60 * 1000;

/** 文字列から 0以上1未満 の値を決める(同じ時間帯・同じ店なら同じ値。FNV-1a)。 */
function seeded(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function attributeKeys(db: Loose, shopIds: string[]): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  for (let i = 0; i < shopIds.length; i += ATTR_CHUNK) {
    const { data } = await db
      .from("locapass_shop_attributes")
      .select("shop_id, attribute_key")
      .in("shop_id", shopIds.slice(i, i + ATTR_CHUNK));
    for (const r of (data ?? []) as { shop_id: string; attribute_key: string }[]) {
      if (!map.has(r.shop_id)) map.set(r.shop_id, new Set());
      map.get(r.shop_id)!.add(r.attribute_key);
    }
  }
  return map;
}

/**
 * 店舗ページの「近くのおすすめ」。同じポータル(エリア)の公開中の店から選ぶ。
 *
 * 並び順は2段階。
 *  1. 有料掲載の店を先に、無料掲載の店はそのあと(有料の店が無ければ無料の店だけで埋まる)。
 *  2. 同じ段の中では、似ている順(業態・ジャンル・属性・近さ)。同じくらいの店は1時間ごとに順番が入れ替わる(ローテーション)。
 * 自店と何の関連もない店(業態もジャンルも属性も違い、近くもない)は、有料の店でも出さない(内容に合った枠だけにする)。
 * 取得に失敗したときや候補が無いときは空を返す(枠なしで表示する)。
 */
export async function getRelatedShops(
  supabase: unknown,
  shopId: string,
  { limit = 6, now = Date.now() }: { limit?: number; now?: number } = {},
): Promise<RelatedShop[]> {
  try {
    const db = supabase as Loose;
    const { data: self } = await db
      .from("locapass_shops")
      .select(`${COLUMNS}, portal_id`)
      .eq("id", shopId)
      .maybeSingle();
    if (!self) return [];

    const { data: portal } = await db.from("locapass_portals").select("slug").eq("id", self.portal_id).maybeSingle();
    if (!portal?.slug) return [];

    const base = () => db.from("locapass_shops").select(COLUMNS).eq("portal_id", self.portal_id).eq("status", "active").neq("id", shopId);
    const [paidRes, freeRes] = await Promise.all([
      base().neq("plan", "free").not("plan", "is", null).limit(PAID_CANDIDATES),
      base().or("plan.is.null,plan.eq.free").order("created_at", { ascending: false }).limit(FREE_CANDIDATES),
    ]);
    if (paidRes.error || freeRes.error) console.error("[getRelatedShops] query", paidRes.error?.message, freeRes.error?.message);
    const candidates = [...((paidRes.data ?? []) as ShopRow[]), ...((freeRes.data ?? []) as ShopRow[])].filter(
      (c) => !isDemoShop(c.name, c.slug),
    );
    if (candidates.length === 0) return [];

    const attrs = await attributeKeys(db, [shopId, ...candidates.map((c) => c.id)]);
    const selfAttrs = attrs.get(shopId) ?? new Set<string>();
    const bucket = Math.floor(now / ROTATION_MS);

    const ranked = candidates
      .map((c) => {
        let relevance = 0;
        if (self.business_type && c.business_type === self.business_type) relevance += 3;
        if (self.category && c.category === self.category) relevance += 1.5;
        const cAttrs = attrs.get(c.id) ?? new Set<string>();
        if (selfAttrs.size > 0 && cAttrs.size > 0) {
          const shared = [...selfAttrs].filter((k) => cAttrs.has(k)).length;
          relevance += (shared / (selfAttrs.size + cAttrs.size - shared)) * 3;
        }
        if (typeof self.lat === "number" && typeof self.lng === "number" && typeof c.lat === "number" && typeof c.lng === "number") {
          const km = distanceKm(self.lat, self.lng, c.lat, c.lng);
          relevance += km < 1 ? 2 : km < 3 ? 1.2 : km < 10 ? 0.5 : 0;
        }
        return { c, relevance, sponsored: isPaidPlan(c.plan) };
      })
      // 何の関連もない店は出さない(「近くの・似た店」の枠にするため)。
      .filter((x) => x.relevance >= 1)
      .map((x) => ({ ...x, score: x.relevance + (x.c.cover_url ? 0.5 : 0) + seeded(`${x.c.id}:${bucket}`) * JITTER }))
      // 有料の店が先、同じ段の中ではスコアの高い順。
      .sort((a, b) => Number(b.sponsored) - Number(a.sponsored) || b.score - a.score);

    return ranked.slice(0, limit).map(({ c, sponsored }) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      portalSlug: portal.slug as string,
      genre: c.category,
      area: c.area,
      coverImageUrl: c.cover_url,
      sponsored,
    }));
  } catch (e) {
    console.error("[getRelatedShops]", e);
    return [];
  }
}
