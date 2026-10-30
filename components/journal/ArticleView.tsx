import Link from "next/link";
import { Cover } from "@/components/journal/Cover";
import { PostBody } from "@/components/journal/PostBody";
import { isSafeLinkUrl, type JournalPost } from "@/lib/journal/posts";
import type { Locale } from "@/lib/i18n/locale";
import { formatJournalDateFor, journalText } from "@/lib/journal/text";

/** 記事の見た目(表紙・見出し・導入・本文)。公開ページと、編集画面のプレビューで同じものを使う。 */
export function ArticleView({ post, linkCategory = true, locale = "ja" }: { post: JournalPost; linkCategory?: boolean; locale?: Locale }) {
  const t = journalText(locale);
  return (
    <>
      <Cover post={post} eager className="aspect-[16/10] rounded-2xl" />
      <header className="space-y-3">
        <div className="flex items-center gap-2 text-[11px] text-tone-500">
          {linkCategory ? (
            <Link href={`/journal?cat=${post.category}`} className="text-hl-400/80 hover:text-hl-200">
              {t.categoryLabels[post.category]}
            </Link>
          ) : (
            <span className="text-hl-400/80">{t.categoryLabels[post.category]}</span>
          )}
          <span aria-hidden>·</span>
          <time dateTime={post.date}>{formatJournalDateFor(post.date, locale)}</time>
        </div>
        <h1 className="text-2xl font-bold leading-snug text-main">{post.title || t.untitled}</h1>
        {post.lead ? <p className="text-base leading-8 text-tone-200">{post.lead}</p> : null}
      </header>
      <PostBody blocks={post.body} />
      {post.link && isSafeLinkUrl(post.link.url) ? (
        <div className="pt-4 text-center">
          {post.link.url.startsWith("/") ? (
            <Link
              href={post.link.url}
              className="inline-block rounded-full bg-cta-light px-6 py-3 text-sm font-bold text-on-cta-gold transition hover:bg-cta-hover"
            >
              {post.link.label}
            </Link>
          ) : (
            <a
              href={post.link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-full bg-cta-light px-6 py-3 text-sm font-bold text-on-cta-gold transition hover:bg-cta-hover"
            >
              {post.link.label}
            </a>
          )}
        </div>
      ) : null}
    </>
  );
}
