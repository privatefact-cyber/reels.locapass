import { createStaticClient } from "@/lib/supabase/static";
import { rowToJournalPost, type JournalPost } from "@/lib/journal/posts";

export const JOURNAL_COLUMNS = "id, slug, category, title, description, lead, cover_url, cover_alt, body, status, published_on";

// 公開済みの記事だけを、ログインに関係なく読む(RLSでも公開済みだけが返る)。
// locapass_journal_posts は生成済みの型(types/supabase.ts)にまだ無いので、型を緩めて呼ぶ。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createStaticClient() as any;

export async function listPublishedJournalPosts(): Promise<JournalPost[]> {
  const { data } = await db()
    .from("locapass_journal_posts")
    .select(JOURNAL_COLUMNS)
    .eq("status", "published")
    .order("published_on", { ascending: false })
    .order("created_at", { ascending: false });
  return ((data ?? []) as Parameters<typeof rowToJournalPost>[0][]).map(rowToJournalPost);
}

export async function getPublishedJournalPost(slug: string): Promise<JournalPost | null> {
  const { data } = await db()
    .from("locapass_journal_posts")
    .select(JOURNAL_COLUMNS)
    .eq("status", "published")
    .eq("slug", slug)
    .maybeSingle();
  return data ? rowToJournalPost(data) : null;
}
