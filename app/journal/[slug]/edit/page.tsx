import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { JournalEditor } from "@/components/journal/JournalEditor";
import { getJournalAccess } from "@/lib/journal/access";
import { JOURNAL_COLUMNS } from "@/lib/journal/queries";
import { JOURNAL_DEFAULT_LINK_LABEL, rowToJournalPost, serializeJournalBody } from "@/lib/journal/posts";

export const metadata: Metadata = { title: "記事を編集", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function EditJournalPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, user, isEditor } = await getJournalAccess();
  if (!user) redirect("/mypage/login?redirect=" + encodeURIComponent(`/journal/${slug}/edit`));
  if (!isEditor) notFound();

  // ログイン中の本人の権限で読むので、下書きも読める(RLS)。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).from("locapass_journal_posts").select(JOURNAL_COLUMNS).eq("slug", slug).maybeSingle();
  if (!data) notFound();
  const post = rowToJournalPost(data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows } = await (supabase as any).from("locapass_journal_posts").select("slug, title").order("created_at", { ascending: false });
  const articles = (rows ?? []) as { slug: string; title: string }[];

  return (
    <JournalEditor
      initial={{
        id: post.id,
        slug: post.slug,
        category: post.category,
        title: post.title,
        description: post.description,
        lead: post.lead ?? "",
        coverUrl: post.cover?.src ?? "",
        coverAlt: post.cover?.alt ?? "",
        bodyText: serializeJournalBody(post.body),
        status: post.status ?? "draft",
        publishedOn: post.date,
        linkUrl: post.link?.url ?? "",
        linkLabel: post.link && post.link.label !== JOURNAL_DEFAULT_LINK_LABEL ? post.link.label : "",
      }}
      articles={articles}
    />
  );
}
