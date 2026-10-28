import type { Metadata } from "next";
import Link from "next/link";
import {
  JOURNAL_CATEGORY_LABELS,
  JOURNAL_CATEGORY_NOTES,
  JOURNAL_POSTS,
  formatJournalDate,
  type JournalCategory,
} from "@/lib/journal/posts";

export const metadata: Metadata = {
  title: "Journal",
  description: "LOCAPASSの使い方のコツ(Tips)と、お知らせ・アップデート・開発日誌(Topics)をお届けします。",
  alternates: { canonical: "https://locapass.net/journal" },
};

const CATEGORIES: JournalCategory[] = ["topics", "tips"];

export default async function JournalIndexPage({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  const { cat } = await searchParams;
  const active = CATEGORIES.find((c) => c === cat) ?? null;
  const posts = active ? JOURNAL_POSTS.filter((p) => p.category === active) : JOURNAL_POSTS;

  const tab = (current: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs transition ${
      current ? "border-hl-400 text-main" : "border-main/15 text-tone-300 hover:text-main"
    }`;

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 pb-28 pt-6 md:pt-8">
      <header className="space-y-2 text-center">
        <p className="text-[11px] tracking-[0.3em] text-hl-400/60">── JOURNAL ──</p>
        <h1 className="font-display bg-gradient-to-r from-hl-200 via-hl-400 to-hl-200 bg-clip-text text-2xl font-bold text-transparent">
          LOCAPASS Journal
        </h1>
        <p className="text-xs text-muted">使い方のコツと、お知らせ・開発日誌</p>
      </header>

      <nav className="flex flex-wrap justify-center gap-2" aria-label="カテゴリ">
        <Link href="/journal" className={tab(!active)}>
          すべて
        </Link>
        {CATEGORIES.map((c) => (
          <Link key={c} href={`/journal?cat=${c}`} className={tab(active === c)}>
            {JOURNAL_CATEGORY_LABELS[c]}
            <span className="ml-1 text-[10px] text-tone-500">{JOURNAL_CATEGORY_NOTES[c]}</span>
          </Link>
        ))}
      </nav>

      {posts.length === 0 ? (
        <p className="text-center text-sm text-muted">記事はまだありません。</p>
      ) : (
        <ul className="space-y-3">
          {posts.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/journal/${p.slug}`}
                className="block space-y-2 rounded-2xl border border-main/15 bg-panel-950 p-4 transition hover:border-hl-400/50"
              >
                <div className="flex items-center gap-2 text-[11px] text-tone-500">
                  <span className="rounded-full bg-tone-700 px-2 py-0.5 text-[10px] text-main">{JOURNAL_CATEGORY_LABELS[p.category]}</span>
                  <time dateTime={p.date}>{formatJournalDate(p.date)}</time>
                </div>
                <h2 className="text-base font-bold leading-snug text-main">{p.title}</h2>
                <p className="text-xs leading-6 text-muted">{p.description}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
