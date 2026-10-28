import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { JournalEditor } from "@/components/journal/JournalEditor";
import { getJournalAccess } from "@/lib/journal/access";

export const metadata: Metadata = { title: "記事を書く", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function todayJst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export default async function NewJournalPostPage() {
  const { supabase, user, isEditor } = await getJournalAccess();
  if (!user) redirect("/mypage/login?redirect=" + encodeURIComponent("/journal/new"));
  if (!isEditor) notFound();

  // 本文からリンクできる、ほかの記事(下書きも含む。書ける人の権限で読む)。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows } = await (supabase as any).from("locapass_journal_posts").select("slug, title").order("created_at", { ascending: false });
  const articles = (rows ?? []) as { slug: string; title: string }[];

  const date = todayJst();
  return (
    <JournalEditor
      initial={{
        slug: `post-${date.replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6)}`,
        category: "topics",
        title: "",
        description: "",
        lead: "",
        coverUrl: "",
        coverAlt: "",
        bodyText: "",
        status: "draft",
        publishedOn: date,
        linkUrl: "",
        linkLabel: "",
      }}
      articles={articles}
    />
  );
}
