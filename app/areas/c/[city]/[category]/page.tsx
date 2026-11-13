import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "@/components/i18n/LocaleLink";
import { JsonLd } from "@/components/JsonLd";
import { CityShopList } from "@/components/seo/CityShopList";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { categorySummary } from "@/lib/seo/areaGuide";
import {
  MIN_SHOPS_FOR_CITY_PAGE,
  SITE_URL,
  categoryKeyword,
  categoryToSlug,
  cityCategoryPath,
  cityCategoryUrl,
  cityPath,
  cityUrl,
  getCityAreas,
  slugToCategory,
} from "@/lib/seo/cityAreas";
import { shopPath } from "@/lib/locapass/publicUrls";

export const revalidate = 600;

type Params = { city: string; category: string };

async function resolve(params: Params) {
  const key = decodeURIComponent(params.city);
  const category = slugToCategory(params.category);
  if (!category) return null;
  const areas = await getCityAreas();
  const area = areas.find((a) => a.key === key);
  const shops = area?.byCategory.get(category);
  if (!area || !shops || shops.length === 0) return null;
  return { area, category, shops, areas };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const p = await params;
  const r = await resolve(p);
  if (!r) return { title: "ページが見つかりません" };
  const locale = await getServerLocale();
  const kw = categoryKeyword(r.category);
  const title = `${r.area.city}の${kw}｜${r.shops.length}店をリールで比較`;
  const names = r.shops.slice(0, 3).map((s) => s.name).join("、");
  const description = `${r.area.prefecture}${r.area.city}の${kw}${r.shops.length}店を掲載。${names}など、店の雰囲気や最新情報をショート動画(リール)で確認してから選べます。`;
  const url = cityCategoryUrl(r.area.key, p.category);
  const indexable = locale === "ja" && r.shops.length >= MIN_SHOPS_FOR_CITY_PAGE;
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: indexable ? undefined : { index: false, follow: true },
    openGraph: { title, description, url, siteName: "LOCAPASS" },
    twitter: { card: "summary", title, description },
  };
}

export default async function CityCategoryPage({ params }: { params: Promise<Params> }) {
  const p = await params;
  const r = await resolve(p);
  if (!r) notFound();
  const { area, category, shops, areas } = r;
  const kw = categoryKeyword(category);
  const url = cityCategoryUrl(area.key, p.category);
  const summary = categorySummary(category);

  // 町名(神宮前・宇田川町など)。ページの文に実際の地名を入れる。
  const towns = [...new Set(shops.map((s) => s.town).filter((t): t is string => !!t))].slice(0, 5);
  // 同じ地域のほかの業種 / 同じ業種のほかの地域(内部リンク)
  const otherCategories = [...area.byCategory.entries()].filter(([c]) => c !== category).sort((a, b) => b[1].length - a[1].length);
  const otherCities = areas
    .filter((a) => a.key !== area.key && (a.byCategory.get(category)?.length ?? 0) >= MIN_SHOPS_FOR_CITY_PAGE)
    .sort((a, b) => (b.byCategory.get(category)?.length ?? 0) - (a.byCategory.get(category)?.length ?? 0))
    .slice(0, 8);

  return (
    <div className="mx-auto max-w-md space-y-8 px-4 py-8 md:max-w-3xl">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "ホーム", item: SITE_URL },
            { "@type": "ListItem", position: 2, name: "エリアから探す", item: `${SITE_URL}/areas` },
            { "@type": "ListItem", position: 3, name: area.city, item: cityUrl(area.key) },
            { "@type": "ListItem", position: 4, name: `${area.city}の${kw}`, item: url },
          ],
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          itemListElement: shops.map((s, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE_URL}${shopPath(s.portalSlug, s.slug)}`, name: s.name })),
        }}
      />

      <header className="space-y-3">
        <nav aria-label="パンくずリスト" className="text-xs text-muted">
          <Link href="/" className="hover:text-hl-200">ホーム</Link> / <Link href="/areas" className="hover:text-hl-200">エリアから探す</Link> /{" "}
          <Link href={cityPath(area.key)} className="hover:text-hl-200">{area.city}</Link>
        </nav>
        <h1 className="font-display text-2xl font-bold leading-snug text-main sm:text-3xl">{area.city}の{kw}</h1>
        <p className="text-sm leading-relaxed text-muted">
          {area.prefecture}{area.city}の{kw}を、{shops.length}店舗掲載しています。
          {towns.length > 0 && `${towns.join("・")}などのお店があります。`}
          お店の雰囲気や最新の様子を、ショート動画(リール)で確認してから選べます。
        </p>
        {summary && <p className="text-sm leading-relaxed text-muted">{summary}</p>}
      </header>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-hl-200">{area.city}の{kw}一覧({shops.length}店舗)</h2>
        <CityShopList shops={shops} />
      </section>

      {otherCategories.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-base font-semibold text-hl-200">{area.city}のほかのお店</h2>
          <ul className="flex flex-wrap gap-2">
            {otherCategories.map(([c, list]) => (
              <li key={c}>
                <Link href={cityCategoryPath(area.key, categoryToSlug(c)!)} className="inline-block rounded-full border border-main/20 px-3 py-1 text-xs text-main hover:border-hl-400/60">
                  {area.city}の{categoryKeyword(c)}({list.length})
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {otherCities.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-base font-semibold text-hl-200">ほかのエリアの{kw}</h2>
          <ul className="flex flex-wrap gap-2">
            {otherCities.map((a) => (
              <li key={a.key}>
                <Link href={cityCategoryPath(a.key, p.category)} className="inline-block rounded-full border border-main/20 px-3 py-1 text-xs text-main hover:border-hl-400/60">
                  {a.city}の{kw}({a.byCategory.get(category)?.length})
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs">
        <Link href="/map" className="text-hl-200 underline underline-offset-2">地図で{area.city}のお店を探す</Link>
      </p>
    </div>
  );
}
