import Link from "next/link";
import { Cover } from "@/components/journal/Cover";
import { PostBody } from "@/components/journal/PostBody";
import { JOURNAL_CATEGORY_LABELS, formatJournalDate, type JournalPost } from "@/lib/journal/posts";

/** 記事の見た目(表紙・見出し・導入・本文)。公開ページと、編集画面のプレビューで同じものを使う。 */
export function ArticleView({ post, linkCategory = true }: { post: JournalPost; linkCategory?: boolean }) {
  return (
    <>
      <Cover post={post} eager className="aspect-[16/10] rounded-2xl" />
      <header className="space-y-3">
        <div className="flex items-center gap-2 text-[11px] text-tone-500">
          {linkCategory ? (
            <Link href={`/journal?cat=${post.category}`} className="text-hl-400/80 hover:text-hl-200">
              {JOURNAL_CATEGORY_LABELS[post.category]}
            </Link>
          ) : (
            <span className="text-hl-400/80">{JOURNAL_CATEGORY_LABELS[post.category]}</span>
          )}
          <span aria-hidden>·</span>
          <time dateTime={post.date}>{formatJournalDate(post.date)}</time>
        </div>
        <h1 className="text-2xl font-bold leading-snug text-main">{post.title || "(タイトル)"}</h1>
        {post.lead ? <p className="text-base leading-8 text-tone-200">{post.lead}</p> : null}
      </header>
      <PostBody blocks={post.body} />
    </>
  );
}
