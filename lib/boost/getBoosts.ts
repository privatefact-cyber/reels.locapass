import { createStaticClient } from "@/lib/supabase/static";
import type { BoostItem } from "./types";

type Row = {
  id: string;
  title: string;
  description: string;
  image_url: string | null;
  discount_tag: string | null;
  created_at: string;
  expires_at: string;
  shop: {
    id: string;
    name: string;
    tel: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
    icon_url: string | null;
    cover_url: string | null;
    slug: string;
    portal: { slug: string } | { slug: string }[] | null;
  } | null;
};

/** 掲載中(active かつ期限内)のブーストを、残り時間が短い順ではなく新着順で返す。公開RLSがそのまま効く。 */
export async function getActiveBoosts(): Promise<BoostItem[]> {
  const supabase = createStaticClient();
  const { data } = await (supabase as any)
    .from("locapass_boost_posts")
    .select(
      "id, title, description, image_url, discount_tag, created_at, expires_at, shop:locapass_shops ( id, name, tel, address, lat, lng, icon_url, cover_url, slug, portal:locapass_portals ( slug ) )",
    )
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(60);

  return ((data ?? []) as Row[])
    .map((r): BoostItem | null => {
      const s = Array.isArray(r.shop) ? r.shop[0] : r.shop;
      if (!s) return null;
      const portal = Array.isArray(s.portal) ? s.portal[0] : s.portal;
      return {
        id: r.id,
        title: r.title,
        description: r.description,
        imageUrl: r.image_url ?? s.cover_url ?? null,
        discountTag: r.discount_tag,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
        shop: {
          id: s.id,
          name: s.name,
          tel: s.tel,
          address: s.address,
          lat: s.lat,
          lng: s.lng,
          iconUrl: s.icon_url,
          shopPath: portal ? `/${portal.slug}/shops/${s.slug}` : null,
        },
      };
    })
    .filter((b): b is BoostItem => b !== null);
}
