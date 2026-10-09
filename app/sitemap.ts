import type { MetadataRoute } from "next";
import { EXCLUDE_OFFICIAL_FILTER } from "@/lib/shop/genres";
import { createStaticClient } from "@/lib/supabase/static";
import { PREFECTURE_SLUG, listAreaCategorySlugs } from "@/lib/seo/area";
import { genreToSlug } from "@/lib/shop/genres";
import { shopPath, castPath } from "@/lib/locapass/publicUrls";

const BASE_URL = "https://locapass.net";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createStaticClient();

  const [{ data: shops }, { data: castRows }] = await Promise.all([
    supabase
      .from("locapass_shops")
      .select("id, slug, area, genre:category, created_at, portal:locapass_portals ( slug )")
      .eq("status", "active")
      .or(EXCLUDE_OFFICIAL_FILTER),
    // 公開用ビューは公開中店舗のキャストだけを返す(個人情報の列は含まない)。
    supabase.from("locapass_public_casts").select("issue_no, shop:locapass_shops ( slug, portal:locapass_portals ( slug ) )"),
  ]);

  const staticEntries: MetadataRoute.Sitemap = [
    { url: BASE_URL, changeFrequency: "hourly", priority: 1 },
    { url: `${BASE_URL}/events`, changeFrequency: "daily", priority: 0.6 },
    { url: `${BASE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE_URL}/legal`, changeFrequency: "yearly", priority: 0.2 },
  ];

  const shopEntries: MetadataRoute.Sitemap = (shops ?? [])
    .map((s) => {
      const portal = Array.isArray(s.portal) ? s.portal[0] : s.portal;
      if (!portal) return null;
      return {
        url: `${BASE_URL}${shopPath(portal.slug, s.slug)}`,
        lastModified: s.created_at ? new Date(s.created_at) : undefined,
        changeFrequency: "daily" as const,
        priority: 0.8,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const castEntries: MetadataRoute.Sitemap = (castRows ?? [])
    .map((c) => {
      const shop = Array.isArray(c.shop) ? c.shop[0] : c.shop;
      const portal = shop ? (Array.isArray(shop.portal) ? shop.portal[0] : shop.portal) : null;
      if (!shop || !portal) return null;
      return {
        url: `${BASE_URL}${castPath(portal.slug, shop.slug, c.issue_no!)}`,
        changeFrequency: "daily" as const,
        priority: 0.7,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const areaCategoryEntries: MetadataRoute.Sitemap = listAreaCategorySlugs(shops ?? [], genreToSlug).map(
    ({ city, category }) => ({
      url: `${BASE_URL}/${PREFECTURE_SLUG}/${city}/${category}`,
      changeFrequency: "daily",
      priority: 0.9,
    }),
  );

  return [...staticEntries, ...areaCategoryEntries, ...shopEntries, ...castEntries];
}
