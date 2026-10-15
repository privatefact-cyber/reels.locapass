import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Row = { id: string; question: string; answered: boolean; escalated: boolean; contact: string | null; audience: string; created_at: string };

export default async function AdminSupportPage() {
  await requireRootAdmin();
  const { data } = await (createAdminClient() as any)
    .from("locapass_support_questions")
    .select("id, question, answered, escalated, contact, audience, created_at")
    .or("answered.eq.false,escalated.eq.true")
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as Row[];
  const esc = rows.filter((r) => r.escalated);
  const missed = rows.filter((r) => !r.escalated);
  const fmt = (iso: string) => new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  return (
    <div className="max-w-3xl space-y-8 text-slate-900">
      <div>
        <h1 className="text-3xl font-bold">サポートAIの質問</h1>
        <p className="mt-1 text-sm text-slate-600">
          「運営に送られた質問」と「AIが答えられなかった質問」です。多い質問は、lib/support/docs.ts に機能カードを足すと、AIが答えられるようになります。
        </p>
      </div>
      <section>
        <h2 className="mb-2 text-lg font-bold">運営に送られた質問({esc.length})</h2>
        {esc.length === 0 ? <p className="text-sm text-slate-500">ありません。</p> : (
          <ul className="space-y-2">
            {esc.map((r) => (
              <li key={r.id} className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
                <p className="font-semibold">{r.question}</p>
                <p className="mt-1 text-xs text-slate-600">{fmt(r.created_at)} / {r.audience === "shop" ? "店舗" : "お客様"} / 返信先: {r.contact ?? "なし"}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="mb-2 text-lg font-bold">AIが答えられなかった質問({missed.length})</h2>
        {missed.length === 0 ? <p className="text-sm text-slate-500">ありません。</p> : (
          <ul className="space-y-2">
            {missed.map((r) => (
              <li key={r.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                <p>{r.question}</p>
                <p className="mt-1 text-xs text-slate-500">{fmt(r.created_at)} / {r.audience === "shop" ? "店舗" : "お客様"}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
