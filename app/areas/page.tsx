import type { Metadata } from "next";
import Link from "@/components/i18n/LocaleLink";
import { JsonLd } from "@/components/JsonLd";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { createClient } from "@/lib/supabase/server";
import { MIN_SHOPS_FOR_GUIDE, getPortalStats } from "@/lib/seo/areaStats";
import { portalBlurb, portalLabel } from "@/lib/seo/areaGuide";
import { isLowProfilePortal } from "@/lib/seo/portalMeta";
import { MIN_SHOPS_FOR_CITY_PAGE, cityPath, getCityAreas } from "@/lib/seo/cityAreas";

export const revalidate = 600;

const TITLE = "エリアから探す｜渋谷・横浜・大洗など、街のお店・カフェ・ペットOKスポット";
const DESCRIPTION =
  "渋谷・原宿、横浜、大洗、ペット同伴OKのお店、美容室・ネイル、キッチンカーなど、LOCAPASSで探せるエリアと分野の一覧。エリアごとの紹介から、お店の一覧へ進めます。";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return {
    title: TITLE,
    description: DESCRIPTION,
    // この一覧は日本語のみ。他の言語のURLは検索には出さず、日本語版を正とする。
    alternates: { canonical: "https://locapass.net/areas" },
    robots: locale === "ja" ? undefined : { index: false, follow: true },
    openGraph: { title: TITLE, description: DESCRIPTION, url: "https://locapass.net/areas", siteName: "LOCAPASS" },
    twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
  };
}

export default async function AreasIndexPage() {
  const supabase = await createClient();
  const portals = (await getPortalStats(supabase)).filter((p) => p.total >= MIN_SHOPS_FOR_GUIDE && !isLowProfilePortal(p.slug));

  const cities = (await getCityAreas()).filter((a) => a.shops.length >= MIN_SHOPS_FOR_CITY_PAGE).slice(0, 40);

  return (
    <div className="mx-auto max-w-md space-y-8 px-4 py-8 md:max-w-4xl">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "ホーム", item: "https://locapass.net" },
            { "@type": "ListItem", position: 2, name: "エリアから探す", item: "https://locapass.net/areas" },
          ],
        }}
      />
      <header className="space-y-2">
        <p className="text-xs tracking-[0.2em] text-hl-400/70">AREAS</p>
        <h1 className="font-display text-2xl font-bold text-main sm:text-3xl">エリアから探す</h1>
        <p className="text-sm leading-relaxed text-muted">
          LOCAPASSで探せるエリアと分野の一覧です。エリア名から、紹介とお店選びのガイドへ、「お店の一覧を見る」から、お店の一覧へ進めます。
        </p>
      </header>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {portals.map((p) => {
          const label = portalLabel(p.slug, p.name);
          const blurb = portalBlurb(p.slug);
          return (
            <li key={p.slug} className="space-y-2 rounded-2xl border border-main/15 bg-panel-950/60 p-4">
              <Link href={`/areas/${p.slug}`} className="font-semibold text-main hover:text-hl-200">
                {label}のお店({p.total}店舗)
              </Link>
              {blurb && <p className="text-xs leading-relaxed text-muted">{blurb}</p>}
              <ul className="flex flex-wrap gap-2">
                {p.categories.slice(0, 6).map((c) => (
                  <li key={c.category} className="rounded-full border border-main/20 px-3 py-1 text-xs text-main">
                    {c.category} {c.count}
                  </li>
                ))}
              </ul>
              <Link href={`/${p.slug}`} className="inline-block text-xs text-hl-200 underline underline-offset-2">
                {label}のお店の一覧を見る
              </Link>
            </li>
          );
        })}
      </ul>

      {cities.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold text-hl-200">市区町村から探す</h2>
          <ul className="flex flex-wrap gap-2">
            {cities.map((a) => (
              <li key={a.key}>
                <Link href={cityPath(a.key)} className="inline-block rounded-full border border-main/20 px-3 py-1 text-xs text-main hover:border-hl-400/60">
                  {a.prefecture}{a.city}({a.shops.length})
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs">
        <Link href="/journal" className="text-hl-200 underline underline-offset-2">ジャーナルを読む</Link>
      </p>
    </div>
  );
}
