/**
 * 公開中のJournal記事を、原文以外の表示言語(日・英・中・アラビア語)に翻訳して locapass_journal_posts.translations に保存する。
 * 記事が変わっていないものはスキップするので、何度実行しても安全。
 * 先にマイグレーション 00166(translations 列)を適用しておくこと。
 *
 *   node --import tsx scripts/backfill-journal-translations.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
import { rowToJournalPost } from "../lib/journal/posts";
import { journalNeedsTranslation, translateJournalPost } from "../lib/journal/translate";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey || !process.env.GEMINI_API_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY are required");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } }) as any;
  const { data, error } = await supabase
    .from("locapass_journal_posts")
    .select("id, slug, category, title, description, lead, cover_url, cover_alt, body, status, published_on, link_url, link_label, translations")
    .eq("status", "published");
  if (error) throw error;

  const posts = (data ?? []).map(rowToJournalPost);
  const targets = posts.filter((p: ReturnType<typeof rowToJournalPost>) => journalNeedsTranslation(p, p.translations));
  console.log(`対象: ${targets.length} / ${posts.length}件`);

  for (const post of targets) {
    const translations = await translateJournalPost(post);
    if (!translations) {
      console.warn(`失敗: ${post.slug}`);
      continue;
    }
    const { error: updateError } = await supabase.from("locapass_journal_posts").update({ translations }).eq("id", post.id);
    console.log(updateError ? `保存失敗: ${post.slug} ${updateError.message}` : `OK: ${post.slug}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
