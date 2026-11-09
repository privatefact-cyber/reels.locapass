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
import { petAdmin } from "@/lib/pet/db";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { isDemoShop } from "@/lib/seo/demo";
import { MIN_SHOPS_FOR_GUIDE, getPortalStats } from "@/lib/seo/areaStats";
import { ATTRIBUTE_KEYS } from "@/lib/verticals/attributes";
import { MIN_SHOPS_FOR_ATTRIBUTE_PAGE } from "@/lib/seo/attributePages";

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

  // 店舗・キャストが1000件を超えても、途中で切れないよう、範囲を区切って全件取る。
  type ShopRow = { id: string; slug: string; name: string; area: string | null; genre: string | null; created_at: string | null; portal: { slug: string } | { slug: string }[] | null };
  type CastRow = { issue_no: number | null; shop: { slug: string; portal: { slug: string } | { slug: string }[] | null } | { slug: string; portal: { slug: string } | { slug: string }[] | null }[] | null };
  const [allShops, castRows] = await Promise.all([
    fetchAllRows<ShopRow>((from, to) =>
      supabase
        .from("locapass_shops")
        .select("id, slug, name, area, genre:category, created_at, portal:locapass_portals ( slug )")
        .eq("status", "active")
        .or(EXCLUDE_OFFICIAL_FILTER)
        .order("id")
        .range(from, to) as unknown as PromiseLike<{ data: ShopRow[] | null; error: { message: string } | null }>,
    ),
    // 公開用ビューは公開中店舗のキャストだけを返す(個人情報の列は含まない)。
    fetchAllRows<CastRow>((from, to) =>
      supabase.from("locapass_public_casts").select("issue_no, shop:locapass_shops ( slug, portal:locapass_portals ( slug ) )").order("issue_no").range(from, to) as unknown as PromiseLike<{ data: CastRow[] | null; error: { message: string } | null }>,
    ),
  ]);
  // デモ(営業・動作確認用)の店舗は、検索エンジンに見せない。
  const shops = allShops.filter((s) => !isDemoShop(s.name, s.slug));

  // リール1本ごとの共有ページ(/reel/[id])と、属性ページ(/tag/[attr])。どちらも公開中の店舗のものだけ。
  type ReelRow = { id: string; shop_id: string; published_at: string | null; updated_at: string | null };
  type AttrRow = { shop_id: string; attribute_key: string };
  const shopById = new Map(shops.map((s) => [s.id, s]));
  const [reelRows, attrRows] = await Promise.all([
    fetchAllRows<ReelRow>((from, to) =>
      supabase
        .from("locapass_reels")
        .select("id, shop_id, published_at, updated_at")
        .eq("status", "publish")
        .or("expires_at.is.null,expires_at.gt.now()")
        .order("id")
        .range(from, to) as unknown as PromiseLike<{ data: ReelRow[] | null; error: { message: string } | null }>,
    ).catch((e) => { console.error("[sitemap] reels failed", e); return [] as ReelRow[]; }),
    fetchAllRows<AttrRow>((from, to) =>
      (supabase as unknown as { from: (t: string) => { select: (c: string) => { order: (c: string) => { range: (a: number, b: number) => PromiseLike<{ data: AttrRow[] | null; error: { message: string } | null }> } } } })
        .from("locapass_shop_attributes").select("shop_id, attribute_key").order("shop_id").range(from, to),
    ).catch((e) => { console.error("[sitemap] attributes failed", e); return [] as AttrRow[]; }),
  ]);
  const portalStats = await getPortalStats(supabase);
  const areaGuideSlugs = portalStats.filter((p) => p.total >= MIN_SHOPS_FOR_GUIDE && !isLowProfilePortal(p.slug)).map((p) => p.slug);

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

  const shopEntries: MetadataRoute.Sitemap = shops
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

  const castEntries: MetadataRoute.Sitemap = castRows
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

  const reelEntries: MetadataRoute.Sitemap = reelRows.flatMap((r) => {
    const shop = shopById.get(r.shop_id);
    const portal = shop ? (Array.isArray(shop.portal) ? shop.portal[0] : shop.portal) : null;
    if (!shop || !portal) return [];
    const modified = r.published_at ?? r.updated_at;
    return [{
      url: `${BASE_URL}/reel/${r.id}`,
      lastModified: modified ? new Date(modified) : undefined,
      changeFrequency: "monthly" as const,
      priority: isLowProfilePortal(portal.slug) ? 0.2 : 0.5,
    }];
  });

  // 店舗数が少ない属性のページは中身が薄いので載せない(ページ側も noindex)。
  const attributeShopCount = new Map<string, Set<string>>();
  for (const row of attrRows) {
    if (!shopById.has(row.shop_id)) continue;
    (attributeShopCount.get(row.attribute_key) ?? attributeShopCount.set(row.attribute_key, new Set()).get(row.attribute_key)!).add(row.shop_id);
  }
  const attributeEntries: MetadataRoute.Sitemap = ATTRIBUTE_KEYS
    .filter((key) => (attributeShopCount.get(key)?.size ?? 0) >= MIN_SHOPS_FOR_ATTRIBUTE_PAGE)
    .map((key) => ({ url: `${BASE_URL}/tag/${key}`, changeFrequency: "weekly" as const, priority: 0.7 }));

  const areaCategoryEntries: MetadataRoute.Sitemap = listAreaCategorySlugs(shops, genreToSlug).map(
    ({ city, category }) => ({
      url: `${BASE_URL}/${PREFECTURE_SLUG}/${city}/${category}`,
      changeFrequency: "daily",
      priority: 0.9,
    }),
  );

  // ロカわんの迷子のお知らせ(お知らせ中)と「見つけました」通報(受付中・14日以内)。日本語のみ(言語別URLなし)。
  // 連絡先はページのHTMLに載せていない(ボタンを押したときだけ表示)。IDと日時だけを引く。
  const petEntries: MetadataRoute.Sitemap = [];
  try {
    const admin = petAdmin();
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const [{ data: lost }, { data: found }] = await Promise.all([
      admin.from("locapass_pet_lost_reports").select("id, created_at").eq("status", "active").is("hidden_at", null).limit(5000),
      admin.from("locapass_pet_found_reports").select("id, created_at").eq("status", "open").is("hidden_at", null).gte("created_at", since).limit(5000),
    ]);
    for (const r of lost ?? []) petEntries.push({ url: `${BASE_URL}/pet/lost/${r.id}`, lastModified: new Date(r.created_at), changeFrequency: "hourly", priority: 0.6 });
    for (const r of found ?? []) petEntries.push({ url: `${BASE_URL}/pet/found/${r.id}`, lastModified: new Date(r.created_at), changeFrequency: "hourly", priority: 0.6 });
  } catch (e) {
    console.error("[sitemap] pet entries failed", e);
  }

  // エリア一覧とエリアガイド(/areas・/areas/○○)は、日本語のみ(言語別URLに展開しない)。
  const areaGuideEntries: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/areas`, changeFrequency: "weekly", priority: 0.8 },
    ...areaGuideSlugs.map((slug) => ({ url: `${BASE_URL}/areas/${slug}`, changeFrequency: "weekly" as const, priority: 0.8 })),
  ];

  return [...withLanguages([...staticEntries, ...portalEntries, ...areaCategoryEntries, ...attributeEntries, ...shopEntries, ...reelEntries, ...castEntries]), ...areaGuideEntries, ...petEntries];
}
