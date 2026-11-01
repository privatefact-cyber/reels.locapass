import Link from "next/link";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { billingDb, yen } from "@/lib/billing/db";
import { createPromo, createTerms, publishTerms, savePlan, setPromoActive } from "../actions";

export const dynamic = "force-dynamic";

type Plan = { code: string; name: string; monthly_fee: number; description: string | null; is_public: boolean; sort_order: number };
type Promo = { id: string; plan_code: string; name: string; kind: "percent" | "amount"; value: number; months: number; starts_on: string | null; ends_on: string | null; is_active: boolean };
type Terms = { id: string; title: string; published_at: string | null; created_at: string };

const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900";

export default async function AdminPlansPage() {
  await requireRootAdmin();
  const t = billingDb(await createClient());
  const [{ data: plans }, { data: promos }, { data: terms }] = await Promise.all([
    t.from("locapass_plans").select("*").order("sort_order"),
    t.from("locapass_plan_promos").select("*").order("created_at", { ascending: false }),
    t.from("locapass_contract_terms").select("id, title, published_at, created_at").order("created_at", { ascending: false }),
  ]);
  const planList = (plans ?? []) as Plan[];

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/billing" className="text-sm text-slate-500 underline">← 掲載料・代理店手数料へ</Link>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">プラン・期間割引・規約</h1>
        <p className="mt-1 text-sm text-slate-600">
          掲載料は、ここのプラン表の金額で決まります(店舗ごとの個別価格はありません)。値引きは「期間割引」で行います。
          店舗が契約した時点の金額と割引は、その契約に写して固定されるので、あとでプラン表を変えても、契約済みの店舗の金額は変わりません。
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">プラン</h2>
        {planList.map((p) => (
          <form key={p.code} action={savePlan} className="grid grid-cols-2 items-end gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-6">
            <input type="hidden" name="code" value={p.code} />
            <div><label className="text-xs text-slate-500">コード</label><div className="mt-1 py-1.5 text-sm font-mono">{p.code}</div></div>
            <div><label className="text-xs text-slate-500">名前</label><input name="name" defaultValue={p.name} className={input} /></div>
            <div><label className="text-xs text-slate-500">月額(円)</label><input name="monthly_fee" type="number" min={0} defaultValue={p.monthly_fee} className={input} /></div>
            <div className="col-span-2"><label className="text-xs text-slate-500">説明</label><input name="description" defaultValue={p.description ?? ""} className={input} /></div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" name="is_public" defaultChecked={p.is_public} /> 店舗に見せる</label>
              <input type="hidden" name="sort_order" value={p.sort_order} />
              <button className="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">保存</button>
            </div>
          </form>
        ))}
        <form action={savePlan} className="grid grid-cols-2 items-end gap-3 rounded-lg border border-dashed border-slate-300 p-4 sm:grid-cols-6">
          <div><label className="text-xs text-slate-500">コード(英小文字)</label><input name="code" required placeholder="premium" className={input} /></div>
          <div><label className="text-xs text-slate-500">名前</label><input name="name" required className={input} /></div>
          <div><label className="text-xs text-slate-500">月額(円)</label><input name="monthly_fee" type="number" min={0} defaultValue={0} className={input} /></div>
          <div className="col-span-2"><label className="text-xs text-slate-500">説明</label><input name="description" className={input} /></div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" name="is_public" /> 店舗に見せる</label>
            <input type="hidden" name="sort_order" value={planList.length * 10} />
            <button className="rounded bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white">追加</button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">期間割引(キャッシュバック相当)</h2>
        <p className="text-sm text-slate-600">契約した月から数えて指定した期間だけ、請求額を下げます。お金を後から返す形ではなく、請求額そのものを下げる形です(手数料の計算も、割引後の入金額が基準になります)。</p>
        <div className="space-y-2">
          {((promos ?? []) as Promo[]).map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <div>
                <b>{p.name}</b>({p.plan_code}) — {p.kind === "percent" ? `${p.value}%引き` : `${yen(p.value)}引き`} × {p.months}か月
                <span className="ml-2 text-xs text-slate-500">対象の契約日 {p.starts_on ?? "制限なし"} 〜 {p.ends_on ?? "制限なし"}</span>
              </div>
              <form action={setPromoActive.bind(null, p.id, !p.is_active)}>
                <button className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100">{p.is_active ? "使用中 → 止める" : "停止中 → 再開"}</button>
              </form>
            </div>
          ))}
        </div>
        <form action={createPromo} className="grid grid-cols-2 items-end gap-3 rounded-lg border border-dashed border-slate-300 p-4 sm:grid-cols-7">
          <div><label className="text-xs text-slate-500">プラン</label>
            <select name="plan_code" required className={input}>{planList.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</select></div>
          <div><label className="text-xs text-slate-500">名前</label><input name="name" required placeholder="開店記念 半額" className={input} /></div>
          <div><label className="text-xs text-slate-500">種類</label>
            <select name="kind" className={input}><option value="percent">%引き</option><option value="amount">円引き(毎月)</option></select></div>
          <div><label className="text-xs text-slate-500">値</label><input name="value" type="number" min={1} required className={input} /></div>
          <div><label className="text-xs text-slate-500">期間(か月)</label><input name="months" type="number" min={1} max={36} required className={input} /></div>
          <div><label className="text-xs text-slate-500">契約日 から〜まで(任意)</label>
            <div className="flex gap-1"><input name="starts_on" type="date" className={input} /><input name="ends_on" type="date" className={input} /></div></div>
          <button className="rounded bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white">追加</button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">契約書(規約)</h2>
        <p className="text-sm text-slate-600">公開した版だけが、店舗の契約画面に出ます。公開後は書き換えられません(変更するときは、新しい版を作って公開します)。店舗が同意した版が、契約に記録されます。</p>
        <div className="space-y-2">
          {((terms ?? []) as Terms[]).map((x) => (
            <div key={x.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <div><b>{x.title}</b><span className="ml-2 text-xs text-slate-500">{x.published_at ? `公開 ${x.published_at.slice(0, 10)}` : "下書き"}</span></div>
              {!x.published_at && <form action={publishTerms.bind(null, x.id)}><button className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white">公開する</button></form>}
            </div>
          ))}
        </div>
        <form action={createTerms} className="space-y-2 rounded-lg border border-dashed border-slate-300 p-4">
          <input name="title" required placeholder="掲載契約書 第1版" className={input} />
          <textarea name="body" required rows={8} placeholder="契約の本文" className={input} />
          <button className="rounded bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white">下書きを作る</button>
        </form>
      </section>
    </div>
  );
}
