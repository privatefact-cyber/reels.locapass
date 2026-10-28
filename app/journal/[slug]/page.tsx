import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
    openGraph: { type: "article", url, title: post.title, description: post.description, publishedTime: post.date },
  };
}

export default async function JournalPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getJournalPost(slug);
  if (!post) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    inLanguage: "ja",
    mainEntityOfPage: `https://locapass.net/journal/${post.slug}`,
    publisher: { "@type": "Organization", name: "LOCAPASS" },
  };

  return (
    <article className="mx-auto max-w-2xl space-y-5 px-4 pb-28 pt-6 md:pt-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Link href="/journal" className="text-xs text-muted hover:text-main">
        ← Journal一覧へ
      </Link>
      <header className="space-y-3">
        <div className="flex items-center gap-2 text-[11px] text-tone-500">
          <Link
            href={`/journal?cat=${post.category}`}
            className="rounded-full bg-tone-700 px-2 py-0.5 text-[10px] text-main hover:opacity-80"
          >
            {JOURNAL_CATEGORY_LABELS[post.category]}
          </Link>
          <time dateTime={post.date}>{formatJournalDate(post.date)}</time>
        </div>
        <h1 className="text-xl font-bold leading-snug text-main">{post.title}</h1>
      </header>
      <PostBody blocks={post.body} />
    </article>
  );
}
