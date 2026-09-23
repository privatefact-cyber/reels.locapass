import type { MetadataRoute } from "next";
import { EXCLUDE_OFFICIAL_FILTER } from "@/lib/shop/genres";
import { createStaticClient } from "@/lib/supabase/static";
import { PREFECTURE_SLUG, listAreaCategorySlugs } from "@/lib/seo/area";
import { genreToSlug } from "@/lib/shop/genres";

const BASE_URL = "https://reels.locapass.net";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createStaticClient();

  const [{ data: shops }, { data: castRows }] = await Promise.all([
    supabase.from("locapass_shops").select("id, area, genre:category, created_at").eq("status", "active").or(EXCLUDE_OFFICIAL_FILTER),
    // 公開用ビューは公開中店舗のキャストだけを返す(個人情報の列は含まない)。
    supabase.from("locapass_public_casts").select("id"),
  ]);

  const staticEntries: MetadataRoute.Sitemap = [
    { url: BASE_URL, changeFrequency: "hourly", priority: 1 },
    { url: `${BASE_URL}/events`, changeFrequency: "daily", priority: 0.6 },
  ];

  const shopEntries: MetadataRoute.Sitemap = (shops ?? []).map((s) => ({
    url: `${BASE_URL}/shops/${s.id}`,
    lastModified: s.created_at ? new Date(s.created_at) : undefined,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  const castEntries: MetadataRoute.Sitemap = (castRows ?? []).map((c) => ({
    url: `${BASE_URL}/cast/${c.id}`,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  const areaCategoryEntries: MetadataRoute.Sitemap = listAreaCategorySlugs(shops ?? [], genreToSlug).map(
    ({ city, category }) => ({
      url: `${BASE_URL}/${PREFECTURE_SLUG}/${city}/${category}`,
      changeFrequency: "daily",
      priority: 0.9,
    }),
  );

  return [...staticEntries, ...areaCategoryEntries, ...shopEntries, ...castEntries];
}
