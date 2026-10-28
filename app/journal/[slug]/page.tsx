import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "@/components/journal/Cover";
import { PostBody } from "@/components/journal/PostBody";
import { JOURNAL_CATEGORY_LABELS, JOURNAL_POSTS, formatJournalDate, getJournalPost } from "@/lib/journal/posts";

export const dynamicParams = false;

export function generateStaticParams() {
  return JOURNAL_POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getJournalPost(slug);
  if (!post) return {};
  const url = `https://locapass.net/journal/${post.slug}`;
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
      ...(post.cover ? { images: [{ url: `https://locapass.net${post.cover.src}`, alt: post.cover.alt }] } : {}),
    },
  };
}

export default async function JournalPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getJournalPost(slug);
  if (!post) notFound();

  const more = JOURNAL_POSTS.filter((p) => p.slug !== post.slug).slice(0, 2);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    inLanguage: "ja",
    mainEntityOfPage: `https://locapass.net/journal/${post.slug}`,
    publisher: { "@type": "Organization", name: "LOCAPASS" },
    ...(post.cover ? { image: `https://locapass.net${post.cover.src}` } : {}),
  };

  return (
    <article className="mx-auto max-w-2xl space-y-6 px-4 pb-28 pt-6 md:pt-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Link href="/journal" className="text-xs text-muted hover:text-main">
        ← Journal
      </Link>
      <Cover post={post} eager className="aspect-[16/10] rounded-2xl" />
      <header className="space-y-3">
        <div className="flex items-center gap-2 text-[11px] text-tone-500">
          <Link href={`/journal?cat=${post.category}`} className="text-hl-400/80 hover:text-hl-200">
            {JOURNAL_CATEGORY_LABELS[post.category]}
          </Link>
          <span aria-hidden>·</span>
          <time dateTime={post.date}>{formatJournalDate(post.date)}</time>
        </div>
        <h1 className="text-2xl font-bold leading-snug text-main">{post.title}</h1>
        {post.lead ? <p className="text-base leading-8 text-tone-200">{post.lead}</p> : null}
      </header>
      <PostBody blocks={post.body} />

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
