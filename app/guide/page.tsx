import type { Metadata } from "next";
import Link from "@/components/i18n/LocaleLink";
import { JsonLd } from "@/components/JsonLd";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { GUIDE_ARTICLES } from "@/lib/guide/articles";
import { GUIDE_UI, guideAlternates, guideLocaleOf, hasGuideTranslation, localizeArticle } from "@/lib/guide/i18n";
import { GUIDE_TRANSLATIONS } from "@/lib/guide/translations";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  const gl = guideLocaleOf(locale);
  const ui = GUIDE_UI[gl];
  const alternates = guideAlternates("/guide", gl);
  // ガイドは日本語・英語。ほかの言語のURLは、検索には出さず、日本語版を正とする。
  const fallbackToJa = locale !== "ja" && locale !== "en";
  return {
    title: ui.indexTitle,
    description: ui.indexDescription,
    alternates: fallbackToJa ? { canonical: "https://locapass.net/guide" } : alternates,
    robots: fallbackToJa ? { index: false, follow: true } : undefined,
    openGraph: { title: ui.indexTitle, description: ui.indexDescription, url: alternates.canonical, siteName: "LOCAPASS" },
    twitter: { card: "summary", title: ui.indexTitle, description: ui.indexDescription },
  };
}

export default async function GuideIndexPage() {
  const gl = guideLocaleOf(await getServerLocale());
  const ui = GUIDE_UI[gl];
  const articles = GUIDE_ARTICLES.filter((a) => hasGuideTranslation(a, gl, GUIDE_TRANSLATIONS)).map((a) => localizeArticle(a, gl, GUIDE_TRANSLATIONS));
  const base = guideAlternates("/guide", gl).canonical;
  return (
    <div className="mx-auto max-w-md space-y-8 px-4 py-8 md:max-w-4xl">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: ui.home, item: base.replace(/\/guide$/, "") || "https://locapass.net" },
            { "@type": "ListItem", position: 2, name: ui.guide, item: base },
          ],
        }}
      />
      <header className="space-y-2">
        <p className="text-xs tracking-[0.2em] text-hl-400/70">GUIDE</p>
        <h1 className="font-display text-2xl font-bold text-main sm:text-3xl">{ui.indexH1}</h1>
        <p className="text-sm leading-relaxed text-muted">{ui.indexLead}</p>
      </header>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-hl-200">{ui.audience.visitor}</h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {articles.map((a) => (
            <li key={a.slug}>
              <Link href={`/guide/${a.slug}`} className="block h-full rounded-2xl border border-main/20 p-4 transition hover:border-hl-400/50">
                <p className="font-semibold text-main">{a.title}</p>
                <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted">{a.description}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
