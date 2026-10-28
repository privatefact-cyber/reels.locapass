import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  question: string;
  answered: boolean;
  escalated: boolean;
  contact: string | null;
  audience: string;
  created_at: string;
  reply: string | null;
  doc_ids: string[] | null;
  feedback: number | null;
};

/** 同じ質問を、表記ゆれ(空白・句読点・!?・全角半角・大文字小文字)をならして、同じものとして数えるためのキー。 */
function normalizeKey(q: string): string {
  return q
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s!?！？。、,.，．~〜…・]+/g, "");
}

export default async function AdminSupportPage() {
  await requireRootAdmin();
  // 直近の2000件ぶんで集計する(運営に送られた分は、元の質問と二重になるので、集計からは外す)。
  const { data } = await (createAdminClient() as any)
    .from("locapass_support_questions")
    .select("id, question, answered, escalated, contact, audience, created_at, reply, doc_ids, feedback")
    .order("created_at", { ascending: false })
    .limit(2000);
  const all = (data ?? []) as Row[];
  const escalated = all.filter((r) => r.escalated).slice(0, 50);
  const asked = all.filter((r) => !r.escalated);

  const answeredCount = asked.filter((r) => r.answered).length;
  const up = asked.filter((r) => r.feedback === 1).length;
  const down = asked.filter((r) => r.feedback === -1).length;
  const pct = (n: number, d: number) => (d === 0 ? "-" : `${Math.round((n / d) * 100)}%`);

  // よく聞かれる質問(回数つき)。
  const groups = new Map<string, { text: string; count: number; unanswered: number; up: number; down: number; last: string }>();
  for (const r of asked) {
    const key = normalizeKey(r.question) || r.question;
    const g = groups.get(key) ?? { text: r.question, count: 0, unanswered: 0, up: 0, down: 0, last: r.created_at };
    g.count += 1;
    if (!r.answered) g.unanswered += 1;
    if (r.feedback === 1) g.up += 1;
    if (r.feedback === -1) g.down += 1;
    if (r.created_at > g.last) {
      g.last = r.created_at;
      g.text = r.question;
    }
    groups.set(key, g);
  }
  const frequent = Array.from(groups.values())
    .sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1))
    .slice(0, 30);

  const disliked = asked.filter((r) => r.feedback === -1).slice(0, 30);
  const missed = asked.filter((r) => !r.answered).slice(0, 50);
  const fmt = (iso: string) => new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  const who = (a: string) => (a === "shop" ? "店舗" : "お客様");

  return (
    <div className="max-w-3xl space-y-8 text-slate-900">
      <div>
        <h1 className="text-3xl font-bold">サポートAIの質問</h1>
        <p className="mt-1 text-sm text-slate-600">
          多い質問や、答えられなかった質問、評価の低かった返事を見て、lib/support/docs.ts に機能カードを足すと、AIが答えられるようになります。
          記録は、メールアドレスと電話番号を伏せて保存しています。
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["質問の数", `${asked.length}`],
          ["答えられた割合", pct(answeredCount, asked.length)],
          ["👍 役に立った", `${up}`],
          ["👎 役に立たなかった", `${down}`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-1 text-lg font-bold">よく聞かれる質問({frequent.length})</h2>
        <p className="mb-2 text-xs text-slate-500">似た言い方は、空白や記号をならして、同じ質問として数えています(言い回しが大きく違うものは、別々に数えます)。</p>
        {frequent.length === 0 ? (
          <p className="text-sm text-slate-500">まだありません。</p>
        ) : (
          <ul className="space-y-2">
            {frequent.map((g) => (
              <li key={g.text} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">{g.text}</p>
                  <span className="shrink-0 rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-bold text-white">{g.count}回</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  答えられなかった {g.unanswered}回 / 👍 {g.up} / 👎 {g.down} / 最後に聞かれた日時 {fmt(g.last)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-bold">評価の低かった返事({disliked.length})</h2>
        {disliked.length === 0 ? (
          <p className="text-sm text-slate-500">ありません。</p>
        ) : (
          <ul className="space-y-2">
            {disliked.map((r) => (
              <li key={r.id} className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
                <p className="font-semibold">Q. {r.question}</p>
                {r.reply ? <p className="mt-1 whitespace-pre-wrap text-slate-700">A. {r.reply}</p> : null}
                <p className="mt-1 text-xs text-slate-500">
                  {fmt(r.created_at)} / {who(r.audience)} / 使ったカード: {r.doc_ids && r.doc_ids.length > 0 ? r.doc_ids.join(", ") : "なし"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-bold">運営に送られた質問({escalated.length})</h2>
        {escalated.length === 0 ? (
          <p className="text-sm text-slate-500">ありません。</p>
        ) : (
          <ul className="space-y-2">
            {escalated.map((r) => (
              <li key={r.id} className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
                <p className="font-semibold">{r.question}</p>
                <p className="mt-1 text-xs text-slate-600">{fmt(r.created_at)} / {who(r.audience)} / 返信先: {r.contact ?? "なし"}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-bold">AIが答えられなかった質問({missed.length})</h2>
        {missed.length === 0 ? (
          <p className="text-sm text-slate-500">ありません。</p>
        ) : (
          <ul className="space-y-2">
            {missed.map((r) => (
              <li key={r.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                <p>{r.question}</p>
                <p className="mt-1 text-xs text-slate-500">{fmt(r.created_at)} / {who(r.audience)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
