import type { MetadataRoute } from "next";
import { EXCLUDE_OFFICIAL_FILTER } from "@/lib/shop/genres";
import { createStaticClient } from "@/lib/supabase/static";
import { PREFECTURE_SLUG, listAreaCategorySlugs } from "@/lib/seo/area";
import { genreToSlug } from "@/lib/shop/genres";
import { shopPath, castPath } from "@/lib/locapass/publicUrls";
import { listPublishedJournalPosts } from "@/lib/journal/queries";
import { isLowProfilePortal } from "@/lib/seo/portalMeta";
import { LOCALES } from "@/lib/i18n/locale";
import { localeLanguageAlternates, localeUrl } from "@/lib/i18n/localePath";

const BASE_URL = "https://locapass.net";

/**
 * 1ページぶん(日本語URL)を、4言語のURLそれぞれのエントリに展開する。
 * 各エントリに hreflang(alternates.languages = ja/en/zh/ar/x-default)を付ける。
 */
function withLanguages(entries: MetadataRoute.Sitemap): MetadataRoute.Sitemap {
  return entries.flatMap((entry) => {
    const path = entry.url.slice(BASE_URL.length) || "/";
    const languages = localeLanguageAlternates(path);
    return LOCALES.map((locale) => ({ ...entry, url: localeUrl(path, locale), alternates: { languages } }));
  });
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createStaticClient();
  const journalPosts = await listPublishedJournalPosts();

  const [{ data: shops }, { data: castRows }] = await Promise.all([
    supabase
      .from("locapass_shops")
      .select("id, slug, area, genre:category, created_at, portal:locapass_portals ( slug )")
      .eq("status", "active")
      .or(EXCLUDE_OFFICIAL_FILTER),
    // 公開用ビューは公開中店舗のキャストだけを返す(個人情報の列は含まない)。
    supabase.from("locapass_public_casts").select("issue_no, shop:locapass_shops ( slug, portal:locapass_portals ( slug ) )"),
  ]);

  // ポータルトップ。これまでサイトマップに無く、検索エンジンが各ポータルのトップを見つけにくかった。
  const { data: portalRows } = await supabase.from("locapass_portals").select("slug").eq("status", "active");
  const portalEntries: MetadataRoute.Sitemap = (portalRows ?? [])
    .filter((p) => p.slug && p.slug !== "locapass")
    .map((p) => ({
      url: `${BASE_URL}/${p.slug}`,
      changeFrequency: "daily" as const,
      priority: isLowProfilePortal(p.slug) ? 0.3 : 0.9,
    }));

  const staticEntries: MetadataRoute.Sitemap = [
    { url: BASE_URL, changeFrequency: "hourly", priority: 1 },
    { url: `${BASE_URL}/events`, changeFrequency: "daily", priority: 0.6 },
    { url: `${BASE_URL}/journal`, changeFrequency: "weekly", priority: 0.5 },
    ...journalPosts.map((p) => ({
      url: `${BASE_URL}/journal/${p.slug}`,
      lastModified: new Date(p.date),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
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
        // 水戸は検索で一押しにしない方針なので、優先度を下げる(除外はしない)。
        priority: isLowProfilePortal(portal.slug) ? 0.3 : 0.8,
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
        priority: isLowProfilePortal(portal.slug) ? 0.2 : 0.7,
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

  return withLanguages([...staticEntries, ...portalEntries, ...areaCategoryEntries, ...shopEntries, ...castEntries]);
}
