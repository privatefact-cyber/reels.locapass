import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleView } from "@/components/journal/ArticleView";
import { Cover } from "@/components/journal/Cover";
import { EditorBar } from "@/components/journal/EditorBar";
import { getPublishedJournalPost, listPublishedJournalPosts } from "@/lib/journal/queries";

// 記事は保存のたびに作り直される(保存の処理が一覧と記事のキャッシュを捨てる)。
// 下書きのURLを開いたときの「ページなし」が残らないよう、短い間隔(60秒)でも作り直す。
export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedJournalPost(slug);
  if (!post) return {};
  const url = `https://locapass.net/journal/${post.slug}`;
  const image = post.cover ? (post.cover.src.startsWith("/") ? `https://locapass.net${post.cover.src}` : post.cover.src) : null;
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: post.title,
      description: post.description,
      publishedTime: post.date,
      ...(image && post.cover ? { images: [{ url: image, alt: post.cover.alt }] } : {}),
    },
  };
}

export default async function JournalPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPublishedJournalPost(slug);
  if (!post) notFound();

  const more = (await listPublishedJournalPosts()).filter((p) => p.slug !== post.slug).slice(0, 2);
  const image = post.cover ? (post.cover.src.startsWith("/") ? `https://locapass.net${post.cover.src}` : post.cover.src) : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    inLanguage: "ja",
    mainEntityOfPage: `https://locapass.net/journal/${post.slug}`,
    publisher: { "@type": "Organization", name: "LOCAPASS" },
    ...(image ? { image } : {}),
  };

  return (
    <article className="mx-auto max-w-2xl space-y-6 px-4 pb-28 pt-6 md:pt-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="flex items-center justify-between gap-3">
        <Link href="/journal" className="text-xs text-muted hover:text-main">
          ← Journal
        </Link>
        <EditorBar editSlug={post.slug} />
      </div>
      <ArticleView post={post} />

      {more.length > 0 ? (
        <section className="space-y-4 border-t border-main/10 pt-8">
          <h2 className="text-sm font-bold text-main">ほかの記事も読んでみる</h2>
          <ul className="grid gap-5 sm:grid-cols-2">
            {more.map((p) => (
              <li key={p.slug}>
                <Link href={`/journal/${p.slug}`} className="group block space-y-2">
                  <Cover post={p} className="aspect-[16/10] rounded-xl transition group-hover:opacity-90" />
                  <p className="text-sm font-bold leading-snug text-main group-hover:text-hl-200">{p.title}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
