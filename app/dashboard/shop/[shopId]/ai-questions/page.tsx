import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import { generateSuggestions } from "../ai-knowledge/actions";

type Row = { id: string; question: string; answer: string | null; created_at: string };

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** 店舗AI質問(有料オプション)に寄せられた質問と、AIの答え。お客様の個人情報は残していない。 */
export default async function DashboardAiQuestionsPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const view = await getShopForManager(shopId);
  if (!view) notFound();
  const shop = view.shop;
  const supabase = (await createClient()) as any;
  const [{ data: opt }, { data: rows }, { data: sugRows }] = await Promise.all([
    supabase.from("locapass_shops").select("ai_chat_enabled").eq("id", shop.id).maybeSingle(),
    supabase.from("locapass_shop_ai_chats").select("id, question, answer, created_at").eq("shop_id", shop.id).order("created_at", { ascending: false }).limit(200),
    supabase.from("locapass_shop_ai_suggestions").select("id, body, question_count, created_at").eq("shop_id", shop.id).order("created_at", { ascending: false }).limit(1),
  ]);
  const suggestion = ((sugRows ?? []) as { id: string; body: string; question_count: number; created_at: string }[])[0] ?? null;
  const enabled = Boolean(opt?.ai_chat_enabled);
  const list = (rows ?? []) as Row[];

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs text-slate-500">{shop.name}</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">AIへの質問</h1>
        <p className="mt-1 text-sm text-slate-600">
          お客様が店舗AIに聞いた質問と、AIの答えです(新しい順・最新200件)。答えられなかった質問は、店舗情報を充実させるヒントになります。
          AIは、店舗情報・料金・営業時間・イベントなど、登録されている内容だけで答えます。
        </p>
        {!enabled && <p className="mt-2 rounded-lg bg-slate-100 p-3 text-sm text-slate-600">店舗AI質問は、現在ご利用になっていません(オプション未契約)。</p>}
      </section>
      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-bold text-slate-900">AIによる店舗ページの改善提案</h2>
          <form action={generateSuggestions.bind(null, shopId)}>
            <button type="submit" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">最新の質問から提案を作る</button>
          </form>
        </div>
        <p className="text-xs text-slate-500">たまった質問をまとめて1回で分析します(質問のたびにAIは呼びません)。1時間に1回まで・質問が3件以上で作れます。</p>
        {suggestion ? (
          <div>
            <p className="text-[11px] text-slate-400">{fmt(suggestion.created_at)} 作成(質問{suggestion.question_count}件から)</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{suggestion.body}</p>
            <p className="mt-2 text-xs text-slate-500">
              足したい情報は、<Link href={`/dashboard/shop/${shopId}/ai-knowledge`} className="underline">「AIの知識」</Link> にファイルを置くか、答えられなかった質問に一言で答えると、すぐ反映されます。
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">まだ提案はありません。</p>
        )}
      </section>

      {list.length === 0 ? (
        <p className="text-sm text-slate-500">まだ質問はありません。</p>
      ) : (
        <ul className="space-y-3">
          {list.map((r) => (
            <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] text-slate-400">{fmt(r.created_at)}</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">Q. {r.question}</p>
              {r.answer && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">A. {r.answer}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
