import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "@/components/i18n/LocaleLink";
import { JsonLd } from "@/components/JsonLd";
import { CityShopList } from "@/components/seo/CityShopList";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import {
  MIN_SHOPS_FOR_CITY_PAGE,
  SITE_URL,
  categoryKeyword,
  categoryToSlug,
  cityCategoryPath,
  cityUrl,
  getCityAreas,
} from "@/lib/seo/cityAreas";
import { shopPath } from "@/lib/locapass/publicUrls";

export const revalidate = 600;

type Params = { city: string };

async function resolve(params: Params) {
  const key = decodeURIComponent(params.city);
  const areas = await getCityAreas();
  const area = areas.find((a) => a.key === key);
  return area ? { area, areas } : null;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const r = await resolve(await params);
  if (!r) return { title: "ページが見つかりません" };
  const { area } = r;
  const locale = await getServerLocale();
  const cats = [...area.byCategory.keys()].slice(0, 3).map(categoryKeyword).join("・");
  const title = `${area.city}のお店・スポット情報｜${cats || "カフェ・飲食店"}を探す`;
  const description = `${area.prefecture}${area.city}のお店${area.shops.length}店舗を掲載。${cats ? `${cats}など、` : ""}店の雰囲気や最新情報をショート動画(リール)で確認できます。`;
  const url = cityUrl(area.key);
  const indexable = locale === "ja" && area.shops.length >= MIN_SHOPS_FOR_CITY_PAGE;
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: indexable ? undefined : { index: false, follow: true },
    openGraph: { title, description, url, siteName: "LOCAPASS" },
    twitter: { card: "summary", title, description },
  };
}

export default async function CityPage({ params }: { params: Promise<Params> }) {
  const r = await resolve(await params);
  if (!r) notFound();
  const { area, areas } = r;
  const categories = [...area.byCategory.entries()].sort((a, b) => b[1].length - a[1].length);
  const nearby = areas.filter((a) => a.key !== area.key && a.prefecture === area.prefecture && a.shops.length >= MIN_SHOPS_FOR_CITY_PAGE).slice(0, 8);

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
          ],
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          itemListElement: area.shops.slice(0, 50).map((s, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE_URL}${shopPath(s.portalSlug, s.slug)}`, name: s.name })),
        }}
      />
      <header className="space-y-3">
        <nav aria-label="パンくずリスト" className="text-xs text-muted">
          <Link href="/" className="hover:text-hl-200">ホーム</Link> / <Link href="/areas" className="hover:text-hl-200">エリアから探す</Link>
        </nav>
        <h1 className="font-display text-2xl font-bold leading-snug text-main sm:text-3xl">{area.city}のお店・スポット情報</h1>
        <p className="text-sm leading-relaxed text-muted">
          {area.prefecture}{area.city}のお店を{area.shops.length}店舗掲載しています。業種から選んで、お店の雰囲気をリール動画で確認できます。
        </p>
      </header>

      {categories.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-lg font-semibold text-hl-200">{area.city}の業種から探す</h2>
          <ul className="flex flex-wrap gap-2">
            {categories.map(([c, list]) => (
              <li key={c}>
                <Link href={cityCategoryPath(area.key, categoryToSlug(c)!)} className="inline-block rounded-full border border-hl-400/40 bg-hl-400/10 px-3 py-1.5 text-xs font-semibold text-hl-200 hover:bg-hl-400/20">
                  {area.city}の{categoryKeyword(c)}({list.length})
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-hl-200">{area.city}の掲載店舗</h2>
        <CityShopList shops={area.shops.slice(0, 60)} showCategory />
      </section>

      {nearby.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-base font-semibold text-hl-200">{area.prefecture}のほかのエリア</h2>
          <ul className="flex flex-wrap gap-2">
            {nearby.map((a) => (
              <li key={a.key}>
                <Link href={`/areas/c/${encodeURIComponent(a.key)}`} className="inline-block rounded-full border border-main/20 px-3 py-1 text-xs text-main hover:border-hl-400/60">
                  {a.city}({a.shops.length})
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
