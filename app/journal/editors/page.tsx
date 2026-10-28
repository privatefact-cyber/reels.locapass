import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getJournalAccess } from "@/lib/journal/access";
import { addJournalEditor, removeJournalEditor } from "@/app/journal/actions";

export const metadata: Metadata = { title: "投稿担当の管理", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Journalを書ける「投稿担当」を指名・解除する画面。ルート管理者だけが開ける(ルート管理者は、指名しなくても書ける)。 */
export default async function JournalEditorsPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error, ok } = await searchParams;
  const { supabase, user, isSuper } = await getJournalAccess();
  if (!user) redirect("/mypage/login?redirect=" + encodeURIComponent("/journal/editors"));
  if (!isSuper) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).from("locapass_journal_editors").select("user_id, created_at").order("created_at", { ascending: true });
  const rows = (data ?? []) as { user_id: string; created_at: string }[];
  // メールアドレスは、管理用の権限でここでだけ引く(画面には、この管理者にだけ出る)。
  const admin = createAdminClient();
  const editors = await Promise.all(
    rows.map(async (r) => {
      const { data: u } = await admin.auth.admin.getUserById(r.user_id);
      return { ...r, email: u?.user?.email ?? "(メールアドレスなし)" };
    }),
  );

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 pb-28 pt-6 md:pt-8">
      <Link href="/journal" className="text-xs text-muted hover:text-main">
        ← Journal
      </Link>
      <h1 className="text-lg font-bold text-main">投稿担当の管理</h1>
      <p className="text-sm leading-7 text-muted">
        ここで指名した人は、Journalの記事を書いたり直したりできます(ルート管理者は、指名しなくても書けます)。指名したい人には、先にLOCAPASSへログイン(登録)してもらってください。
      </p>

      {error ? <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p> : null}
      {ok ? <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">反映しました。</p> : null}

      <form action={addJournalEditor} className="flex gap-2">
        <input
          name="email"
          type="email"
          required
          placeholder="指名する人のメールアドレス"
          className="w-full rounded-xl border border-main/15 bg-panel-950 px-3 py-2.5 text-sm text-main placeholder:text-tone-600 focus:border-hl-400/60 focus:outline-none"
        />
        <button type="submit" className="shrink-0 rounded-full bg-cta-light px-4 text-sm font-bold text-on-cta-gold hover:bg-cta-hover">
          追加
        </button>
      </form>

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-main">いまの投稿担当({editors.length}人)</h2>
        {editors.length === 0 ? (
          <p className="text-xs text-tone-500">まだ指名していません。</p>
        ) : (
          <ul className="divide-y divide-main/10 rounded-2xl border border-main/10">
            {editors.map((e) => (
              <li key={e.user_id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-main">
                <span className="min-w-0 truncate">{e.email}</span>
                <form action={removeJournalEditor}>
                  <input type="hidden" name="user_id" value={e.user_id} />
                  <button type="submit" className="shrink-0 text-xs text-red-300 underline">
                    外す
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
