import type { Metadata } from "next";
import Link from "next/link";
import { Cover } from "@/components/journal/Cover";
import { EditorBar } from "@/components/journal/EditorBar";
import { listPublishedJournalPosts } from "@/lib/journal/queries";
import { JOURNAL_CATEGORY_LABELS, formatJournalDate, type JournalCategory } from "@/lib/journal/posts";

export const metadata: Metadata = {
  title: "Journal",
  description: "街とお店のちょっといい話。新しくできたことや、使い方のコツを、写真といっしょにお届けします。",
  alternates: { canonical: "https://locapass.net/journal" },
};

const CATEGORIES: JournalCategory[] = ["topics", "tips"];

export default async function JournalIndexPage({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  const { cat } = await searchParams;
  const active = CATEGORIES.find((c) => c === cat) ?? null;
  const all = await listPublishedJournalPosts();
  const posts = active ? all.filter((p) => p.category === active) : all;

  const tab = (current: boolean) =>
    `rounded-full border px-3.5 py-1.5 text-xs transition ${
      current ? "border-hl-400 text-main" : "border-main/15 text-tone-300 hover:text-main"
    }`;

  return (
    <main className="mx-auto max-w-3xl space-y-7 px-4 pb-28 pt-6 md:pt-8">
      <header className="space-y-2 text-center">
        <p className="text-[11px] tracking-[0.3em] text-hl-400/60">── JOURNAL ──</p>
        <h1 className="font-display bg-gradient-to-r from-hl-200 via-hl-400 to-hl-200 bg-clip-text text-3xl font-bold text-transparent">
          LOCAPASS Journal
        </h1>
        <p className="text-sm text-muted">街とお店の、ちょっといい話。</p>
      </header>

      <EditorBar />

      <nav className="flex flex-wrap justify-center gap-2" aria-label="カテゴリ">
        <Link href="/journal" className={tab(!active)}>
          すべて
        </Link>
        {CATEGORIES.map((c) => (
          <Link key={c} href={`/journal?cat=${c}`} className={tab(active === c)}>
            {JOURNAL_CATEGORY_LABELS[c]}
          </Link>
        ))}
      </nav>

      {posts.length === 0 ? (
        <p className="text-center text-sm text-muted">記事はまだありません。</p>
      ) : (
        <ul className="grid gap-6 md:grid-cols-2">
          {posts.map((p) => (
            <li key={p.slug}>
              <Link href={`/journal/${p.slug}`} className="group block space-y-3">
                <Cover post={p} className="aspect-[16/10] rounded-2xl transition group-hover:opacity-90" />
                <div className="space-y-1.5 px-1">
                  <div className="flex items-center gap-2 text-[11px] text-tone-500">
                    <span className="text-hl-400/80">{JOURNAL_CATEGORY_LABELS[p.category]}</span>
                    <span aria-hidden>·</span>
                    <time dateTime={p.date}>{formatJournalDate(p.date)}</time>
                  </div>
                  <h2 className="text-base font-bold leading-snug text-main group-hover:text-hl-200">{p.title}</h2>
                  <p className="line-clamp-2 text-xs leading-6 text-muted">{p.description}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
