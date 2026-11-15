import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "@/components/i18n/LocaleLink";
import { JsonLd } from "@/components/JsonLd";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { GUIDE_ARTICLES, getGuideArticle, relatedGuideArticles } from "@/lib/guide/articles";
import { GUIDE_LOCALES, GUIDE_UI, guideAlternates, guideLocaleOf, hasGuideTranslation, localizeArticle } from "@/lib/guide/i18n";
import { GUIDE_TRANSLATIONS } from "@/lib/guide/translations";
import { MIN_SHOPS_FOR_CITY_PAGE, categoryKeyword, categoryToSlug, cityCategoryPath, getCityAreas } from "@/lib/seo/cityAreas";
import { categoryEn, cityEn } from "@/lib/seo/cityEn";

export const revalidate = 3600;

type Params = { slug: string };

export function generateStaticParams() {
  return GUIDE_ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const base = getGuideArticle(slug);
  if (!base) return { title: "記事が見つかりません" };
  const locale = await getServerLocale();
  const gl = guideLocaleOf(locale);
  const article = localizeArticle(base, gl, GUIDE_TRANSLATIONS);
  // 訳がある言語だけを hreflang に載せる。訳が無い言語のURLは、日本語の文が出るので、検索に出さず日本語版を正とする。
  const available = GUIDE_LOCALES.filter((l) => hasGuideTranslation(base, l, GUIDE_TRANSLATIONS));
  const translated = (locale === "ja" || locale === "en") && hasGuideTranslation(base, gl, GUIDE_TRANSLATIONS);
  const alternates = guideAlternates(`/guide/${article.slug}`, gl, available);
  const url = alternates.canonical;
  return {
    title: article.title,
    description: article.description,
    alternates: translated ? alternates : { canonical: `https://locapass.net/guide/${article.slug}` },
    robots: translated ? undefined : { index: false, follow: true },
    openGraph: { type: "article", title: article.title, description: article.description, url, siteName: "LOCAPASS", publishedTime: article.published, modifiedTime: article.updated },
    twitter: { card: "summary", title: article.title, description: article.description },
  };
}

export default async function GuideArticlePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const base = getGuideArticle(slug);
  if (!base) notFound();
  const locale = await getServerLocale();
  const gl = guideLocaleOf(locale);
  const ui = GUIDE_UI[gl];
  const article = localizeArticle(base, gl, GUIDE_TRANSLATIONS);

  const url = guideAlternates(`/guide/${article.slug}`, gl).canonical;
  const guideIndexUrl = guideAlternates("/guide", gl).canonical;
  const homeUrl = guideIndexUrl.replace(/\/guide$/, "") || "https://locapass.net";
  const related = relatedGuideArticles(base).filter((a) => hasGuideTranslation(a, gl, GUIDE_TRANSLATIONS)).map((a) => localizeArticle(a, gl, GUIDE_TRANSLATIONS));

  // 記事に関連する業種の「地域 × 業種」ページへのリンク(店舗が基準数以上の地域だけ。英語は、地名の英語が分かる地域だけ)。
  const areas = await getCityAreas().catch(() => []);
  const links: { href: string; label: string; count: number }[] = [];
  for (const category of base.categories) {
    const slugC = categoryToSlug(category);
    if (!slugC) continue;
    for (const a of areas) {
      const n = a.byCategory.get(category)?.length ?? 0;
      if (n < MIN_SHOPS_FOR_CITY_PAGE) continue;
      if (gl === "en") {
        const c = cityEn(a.key);
        const cat = categoryEn(category);
        if (!c || !cat) continue;
        links.push({ href: cityCategoryPath(a.key, slugC), label: `${cat.word} in ${c.city}`, count: n });
      } else {
        links.push({ href: cityCategoryPath(a.key, slugC), label: `${a.city}の${categoryKeyword(category)}`, count: n });
      }
    }
  }
  const areaLinks = links.sort((x, y) => y.count - x.count).slice(0, 10);

  return (
    <article className="mx-auto max-w-md space-y-8 px-4 py-8 md:max-w-3xl">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: article.title,
          description: article.description,
          datePublished: article.published,
          dateModified: article.updated,
          inLanguage: ui.htmlLang,
          mainEntityOfPage: url,
          author: { "@type": "Organization", name: ui.editor, url: "https://locapass.net" },
          publisher: { "@type": "Organization", name: "LOCAPASS", url: "https://locapass.net" },
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: ui.home, item: homeUrl },
            { "@type": "ListItem", position: 2, name: ui.guide, item: guideIndexUrl },
            { "@type": "ListItem", position: 3, name: article.title, item: url },
          ],
        }}
      />
      {article.faq && article.faq.length > 0 && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: article.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
          }}
        />
      )}

      <header className="space-y-3">
        <nav aria-label={ui.breadcrumb} className="text-xs text-muted">
          <Link href="/" className="hover:text-hl-200">{ui.home}</Link> / <Link href="/guide" className="hover:text-hl-200">{ui.guide}</Link>
        </nav>
        <p className="text-xs tracking-[0.2em] text-hl-400/70">{ui.audience[article.audience]}</p>
        <h1 className="font-display text-2xl font-bold leading-snug text-main sm:text-3xl">{article.title}</h1>
        <p className="text-xs text-muted">
          {ui.editor} ・ {ui.published} {article.published}
          {article.updated !== article.published ? ` ・ ${ui.updated} ${article.updated}` : ""}
        </p>
        <p className="text-sm leading-relaxed text-muted">{article.lead}</p>
      </header>

      {article.sections.length > 2 && (
        <nav aria-label={ui.toc} className="rounded-2xl border border-main/15 bg-main/5 p-4">
          <p className="text-sm font-semibold text-hl-200">{ui.toc}</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
            {article.sections.map((s, i) => (
              <li key={s.heading}>
                <a href={`#s${i + 1}`} className="hover:text-hl-200">{s.heading}</a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="space-y-8">
        {article.sections.map((s, i) => (
          <section key={s.heading} id={`s${i + 1}`} className="space-y-3">
            <h2 className="font-display text-lg font-semibold text-hl-200">{s.heading}</h2>
            {s.paragraphs?.map((p) => (
              <p key={p} className="text-sm leading-7 text-main/90">{p}</p>
            ))}
            {s.list && (
              <ul className="list-disc space-y-1.5 pl-5 text-sm leading-7 text-main/90">
                {s.list.map((item) => (<li key={item}>{item}</li>))}
              </ul>
            )}
            {s.steps && (
              <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-7 text-main/90">
                {s.steps.map((item) => (<li key={item}>{item}</li>))}
              </ol>
            )}
          </section>
        ))}
      </div>

      {article.faq && article.faq.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold text-hl-200">{ui.faq}</h2>
          <dl className="space-y-3">
            {article.faq.map((f) => (
              <div key={f.q} className="rounded-xl border border-main/15 bg-main/5 p-3">
                <dt className="text-sm font-semibold text-main">{f.q}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-muted">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {areaLinks.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-lg font-semibold text-hl-200">{ui.findShops}</h2>
          <ul className="flex flex-wrap gap-2">
            {areaLinks.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="inline-block rounded-full border border-main/20 px-3 py-1 text-xs text-main hover:border-hl-400/60">
                  {l.label}({l.count})
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {related.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-lg font-semibold text-hl-200">{ui.related}</h2>
          <ul className="space-y-2">
            {related.map((a) => (
              <li key={a.slug}>
                <Link href={`/guide/${a.slug}`} className="text-sm text-main underline underline-offset-2 hover:text-hl-200">{a.title}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-[11px] leading-relaxed text-muted">{ui.disclaimer}</p>
    </article>
  );
}
