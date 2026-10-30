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

/** 公開日("2026-10-30")から月("2026-10")を取り出す。 */
const monthOf = (date: string) => date.slice(0, 7);
const monthLabel = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return `${y}年${m}月`;
};

export default async function JournalIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; month?: string }>;
}) {
  const { cat, month } = await searchParams;
  const active = CATEGORIES.find((c) => c === cat) ?? null;
  const all = await listPublishedJournalPosts();
  const byCategory = active ? all.filter((p) => p.category === active) : all;

  // 月ごとの記事数(新しい月が先頭)。記事は公開日の新しい順に並んで届く。
  const monthCounts = new Map<string, number>();
  for (const p of byCategory) monthCounts.set(monthOf(p.date), (monthCounts.get(monthOf(p.date)) ?? 0) + 1);
  const months = [...monthCounts.keys()];
  const activeMonth = month && monthCounts.has(month) ? month : null;
  const posts = activeMonth ? byCategory.filter((p) => monthOf(p.date) === activeMonth) : byCategory;

  const groups: { month: string; posts: typeof posts }[] = [];
  for (const p of posts) {
    const key = monthOf(p.date);
    const last = groups[groups.length - 1];
    if (last && last.month === key) last.posts.push(p);
    else groups.push({ month: key, posts: [p] });
  }

  const href = (c: JournalCategory | null, m: string | null) => {
    const q = new URLSearchParams();
    if (c) q.set("cat", c);
    if (m) q.set("month", m);
    const s = q.toString();
    return s ? `/journal?${s}` : "/journal";
  };

  const tab = (current: boolean) =>
    `rounded-full border px-3.5 py-1.5 text-xs transition ${
      current ? "border-hl-400 text-main" : "border-main/15 text-tone-300 hover:text-main"
    }`;

  return (
    <main className="mx-auto max-w-3xl space-y-7 px-4 pb-28 pt-6 md:pt-8">
      <header className="space-y-2 text-center">
        <h1 className="font-display bg-gradient-to-r from-hl-200 via-hl-400 to-hl-200 bg-clip-text text-4xl font-bold text-transparent">
          Journal
        </h1>
        <p className="text-sm text-muted">街とお店の、ちょっといい話。</p>
      </header>

      <EditorBar />

      <nav className="flex flex-wrap justify-center gap-2" aria-label="カテゴリ">
        <Link href={href(null, activeMonth)} className={tab(!active)}>
          すべて
        </Link>
        {CATEGORIES.map((c) => (
          <Link key={c} href={href(c, activeMonth)} className={tab(active === c)}>
            {JOURNAL_CATEGORY_LABELS[c]}
          </Link>
        ))}
      </nav>

      {months.length > 1 && (
        <nav className="space-y-2 text-center" aria-label="月別アーカイブ">
          <p className="text-[11px] tracking-wider text-tone-500">ARCHIVE</p>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs">
            <Link
              href={href(active, null)}
              className={!activeMonth ? "text-hl-400" : "text-tone-300 hover:text-main"}
            >
              すべての月
            </Link>
            {months.map((m) => (
              <Link
                key={m}
                href={href(active, m)}
                className={activeMonth === m ? "text-hl-400" : "text-tone-300 hover:text-main"}
              >
                {monthLabel(m)}
                <span className="ml-0.5 text-tone-500">({monthCounts.get(m)})</span>
              </Link>
            ))}
          </div>
        </nav>
      )}

      {posts.length === 0 ? (
        <p className="text-center text-sm text-muted">記事はまだありません。</p>
      ) : (
        <div className="space-y-9">
          {groups.map((g) => (
            <section key={g.month} className="space-y-4" aria-label={monthLabel(g.month)}>
              <h2 className="border-b border-main/10 pb-2 text-sm font-bold tracking-wide text-hl-200">
                {monthLabel(g.month)}
                <span className="ml-2 text-xs font-normal text-tone-500">{g.posts.length}件</span>
              </h2>
              <ul className="grid gap-6 md:grid-cols-2">
                {g.posts.map((p) => (
                  <li key={p.slug}>
                    <Link href={`/journal/${p.slug}`} className="group block space-y-3">
                      <Cover post={p} className="aspect-[16/10] rounded-2xl transition group-hover:opacity-90" />
                      <div className="space-y-1.5 px-1">
                        <div className="flex items-center gap-2 text-[11px] text-tone-500">
                          <span className="text-hl-400/80">{JOURNAL_CATEGORY_LABELS[p.category]}</span>
                          <span aria-hidden>·</span>
                          <time dateTime={p.date}>{formatJournalDate(p.date)}</time>
                        </div>
                        <h3 className="text-base font-bold leading-snug text-main group-hover:text-hl-200">{p.title}</h3>
                        <p className="line-clamp-2 text-xs leading-6 text-muted">{p.description}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
