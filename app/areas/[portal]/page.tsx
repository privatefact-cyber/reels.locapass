import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "@/components/i18n/LocaleLink";
import { JsonLd } from "@/components/JsonLd";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { createClient } from "@/lib/supabase/server";
import { COMMON_FAQ, categorySummary, portalBlurb, portalLabel } from "@/lib/seo/areaGuide";
import { MIN_SHOPS_FOR_GUIDE, getPortalStats } from "@/lib/seo/areaStats";
import { isDemoShop } from "@/lib/seo/demo";
import { isLowProfilePortal } from "@/lib/seo/portalMeta";
import { shopPath } from "@/lib/locapass/publicUrls";
import { listPublishedJournalPosts } from "@/lib/journal/queries";

export const revalidate = 600;

type Params = { portal: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { portal: slug } = await params;
  const supabase = await createClient();
  const stat = (await getPortalStats(supabase)).find((p) => p.slug === slug);
  if (!stat) return { title: "ページが見つかりません" };
  const locale = await getServerLocale();
  const label = portalLabel(slug, stat.name);
  const title = `${label}のお店・スポット情報｜選び方・よくある質問`;
  const description = `${label}で探せるお店やスポットの紹介と、選び方、よくある質問をまとめました。気になる分野から、お店の一覧へご案内します。`;
  const url = `https://locapass.net/areas/${slug}`;
  const indexable = locale === "ja" && stat.total >= MIN_SHOPS_FOR_GUIDE && !isLowProfilePortal(slug);
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: indexable ? undefined : { index: false, follow: true },
    openGraph: { title, description, url, siteName: "LOCAPASS" },
    twitter: { card: "summary", title, description },
  };
}

export default async function AreaGuidePage({ params }: { params: Promise<Params> }) {
  const { portal: slug } = await params;
  const supabase = await createClient();
  const stats = await getPortalStats(supabase);
  const stat = stats.find((p) => p.slug === slug);
  if (!stat) notFound();

  const label = portalLabel(slug, stat.name);
  const blurb = portalBlurb(slug);
  const url = `https://locapass.net/areas/${slug}`;

  // 分野ごとに、新しい店舗を数件(デモは除く)
  const topShops = new Map<string, { slug: string; name: string }[]>();
  for (const { category } of stat.categories.slice(0, 6)) {
    const { data: portal } = await supabase.from("locapass_portals").select("id").eq("slug", slug).maybeSingle();
    const q = supabase.from("locapass_shops").select("slug, name").eq("status", "active").eq("portal_id", portal?.id ?? -1).order("created_at", { ascending: false }).limit(16);
    const { data } = await (category === "その他" ? q.is("category", null) : q.eq("category", category));
    topShops.set(category, (data ?? []).filter((s) => !isDemoShop(s.name, s.slug)).slice(0, 6));
  }

  // ほかのエリア(店舗数の多い順に8まで)と、新しいジャーナル記事
  const others = stats.filter((p) => p.slug !== slug && p.total >= MIN_SHOPS_FOR_GUIDE && !isLowProfilePortal(p.slug)).slice(0, 8);
  const journal = (await listPublishedJournalPosts()).slice(0, 3);

  return (
    <div className="mx-auto max-w-md space-y-8 px-4 py-8 md:max-w-3xl">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "ホーム", item: "https://locapass.net" },
            { "@type": "ListItem", position: 2, name: "エリアから探す", item: "https://locapass.net/areas" },
            { "@type": "ListItem", position: 3, name: label, item: url },
          ],
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: COMMON_FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
        }}
      />

      <header className="space-y-3">
        <nav aria-label="パンくずリスト" className="text-xs text-muted">
          <Link href="/" className="hover:text-hl-200">ホーム</Link> / <Link href="/areas" className="hover:text-hl-200">エリアから探す</Link>
        </nav>
        <h1 className="font-display text-2xl font-bold leading-snug text-main sm:text-3xl">{label}のお店・スポット情報</h1>
        {blurb && <p className="text-sm leading-relaxed text-muted">{blurb}</p>}
        <p className="text-sm leading-relaxed text-muted">
          {label}で探せるお店({stat.total}店舗)を、分野ごとにまとめました。気になる分野から、お店の一覧へ進めます。
        </p>
      </header>

      {stat.categories.slice(0, 6).map(({ category, count }) => {
        const summary = categorySummary(category);
        const shops = topShops.get(category) ?? [];
        return (
          <section key={category} className="space-y-3">
            <h2 className="font-display text-lg font-semibold text-hl-200">{label}の{category}</h2>
            {summary && <p className="text-sm leading-7 text-main/90">{summary}</p>}
            {shops.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {shops.map((s) => (
                  <li key={s.slug}>
                    <Link href={shopPath(slug, s.slug)} className="inline-block rounded-full border border-main/20 px-3 py-1 text-xs text-main hover:border-hl-400/60">
                      {s.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted">{category}のお店は、{count}店舗掲載しています。</p>
          </section>
        );
      })}

      <Link
        href={`/${slug}`}
        className="inline-flex items-center gap-1.5 rounded-full border border-hl-400/40 bg-hl-400/10 px-4 py-2 text-xs font-semibold text-hl-200 transition hover:bg-hl-400/20"
      >
        {label}のお店を、リールで見る({stat.total}店舗)
      </Link>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-hl-200">{label}のお店選びのよくある質問</h2>
        <dl className="space-y-3">
          {COMMON_FAQ.map((f) => (
            <div key={f.q} className="rounded-xl border border-main/15 bg-panel-950/60 p-3">
              <dt className="text-sm font-semibold text-main">{f.q}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-muted">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      {journal.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-base font-semibold text-hl-200">
            <Link href="/journal" className="hover:text-hl-100">ジャーナル</Link>
          </h2>
          <ul className="space-y-1.5">
            {journal.map((p) => (
              <li key={p.slug}>
                <Link href={`/journal/${p.slug}`} className="text-sm text-hl-200 underline underline-offset-2">{p.title}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {others.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-base font-semibold text-hl-200">ほかのエリア</h2>
          <ul className="flex flex-wrap gap-2">
            {others.map((p) => (
              <li key={p.slug}>
                <Link href={`/areas/${p.slug}`} className="inline-block rounded-full border border-main/20 px-3 py-1 text-xs text-main hover:border-hl-400/60">
                  {portalLabel(p.slug, p.name)}
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-xs">
            <Link href="/areas" className="text-hl-200 underline underline-offset-2">エリア一覧をすべて見る</Link>
          </p>
        </section>
      )}
    </div>
  );
}
