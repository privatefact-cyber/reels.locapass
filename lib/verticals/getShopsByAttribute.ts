import { createClient } from "@/lib/supabase/server";
import { EXCLUDE_OFFICIAL_FILTER } from "@/lib/shop/genres";
import { isPlacePhotoUrl } from "@/components/shop/PlacePhotoCredit";
import { latestReelStillsByShop } from "@/lib/map/getVenues";
import { hasRealPhoto, sinkWithoutPhoto } from "@/lib/shop/sinkWithoutPhoto";
import { sanitizeImageUrl } from "@/lib/utils/sanitize-image-url";
import { verticalOf } from "@/lib/verticals/registry";
import type { AttributeKey } from "@/lib/verticals/attributes";
import type { ShopGridItem } from "@/lib/reels/types";

// 属性の表(00178)は生成済みの型に無いので any で扱う(shopAttributes.ts と同じ)。
type Loose = { from: (t: string) => any };

type ShopRow = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  category: string | null;
  business_type: string | null;
  icon_url: string | null;
  cover_url: string | null;
  cover_image_attribution: unknown;
  portal: { slug: string } | { slug: string }[] | null;
};

/**
 * ある属性(ペット同伴可・子連れ歓迎など)がオンの、公開中の店舗をトップのグリッドと同じ形で返す。
 * 店舗ページの属性チップと同じく、その店の業態で出す属性に絞る(業態を変えて出さなくなった属性の行は数えない)。
 * 取得に失敗したら空配列。
 */
export async function getShopsByAttribute(key: AttributeKey): Promise<ShopGridItem[]> {
  const supabase = await createClient();
  const db = supabase as unknown as Loose;

  const { data: attrRows, error } = await db.from("locapass_shop_attributes").select("shop_id").eq("attribute_key", key).limit(5000);
  if (error || !attrRows?.length) return [];
  const shopIds = [...new Set((attrRows as { shop_id: string }[]).map((r) => r.shop_id))];

  // URLが長くなりすぎないよう、IDは分けて引く。
  const chunks: string[][] = [];
  for (let i = 0; i < shopIds.length; i += 200) chunks.push(shopIds.slice(i, i + 200));
  const results = await Promise.all(
    chunks.map((ids) =>
      db
        .from("locapass_shops")
        .select("id, name, slug, address, category, business_type, icon_url, cover_url, cover_image_attribution, portal:locapass_portals ( slug )")
        .in("id", ids)
        .eq("status", "active")
        .or(EXCLUDE_OFFICIAL_FILTER)
        .order("created_at", { ascending: false }),
    ),
  );
  const shops = (results.flatMap((r) => (r.data ?? []) as ShopRow[])).filter((s) => verticalOf(s.business_type).attributes.includes(key));
  if (shops.length === 0) return [];

  const noOwnPhotoIds = shops.filter((s) => !sanitizeImageUrl(s.cover_url ?? s.icon_url)).map((s) => s.id);
  const reelStills = await latestReelStillsByShop(noOwnPhotoIds).catch(() => new Map<string, string>());

  const items: ShopGridItem[] = shops.flatMap((s) => {
    const portal = Array.isArray(s.portal) ? s.portal[0] : s.portal;
    if (!portal) return [];
    return [
      {
        id: s.id,
        name: s.name,
        slug: s.slug,
        portalSlug: portal.slug,
        area: null,
        address: s.address,
        genre: s.category,
        coverImageUrl: sanitizeImageUrl(s.cover_url ?? s.icon_url) ?? sanitizeImageUrl(reelStills.get(s.id)) ?? null,
        coverAttribution: isPlacePhotoUrl(s.cover_url) ? (s.cover_image_attribution as { name?: string; uri?: string | null } | null) : null,
      },
    ];
  });
  return sinkWithoutPhoto(items, (s) => hasRealPhoto(s.coverImageUrl));
}
