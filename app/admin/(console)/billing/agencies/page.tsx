import Link from "next/link";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { billingDb, yen } from "@/lib/billing/db";
import { AGENCY_KINDS, ANNUAL_REVIEW_THRESHOLD, type AgencyKind } from "@/lib/billing/config";
import { endAgencyLink, linkAgencyShop, saveAgency } from "../actions";

export const dynamic = "force-dynamic";

type Agency = {
  id: string; name: string; kind: AgencyKind; invoice_no: string | null; default_rate: number; withholding_rate: number;
  bank_code: string | null; bank_name: string | null; branch_code: string | null; branch_name: string | null;
  account_type: string | null; account_no: string | null; account_holder_kana: string | null; email: string | null; notes: string | null; deduct_invoice_gap: boolean; is_active: boolean;
};
type ShopLink = { id: string; agency_id: string; shop_id: string; rate: number | null; starts_on: string; ended_on: string | null };

const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900";

function AgencyForm({ a }: { a?: Agency }) {
  return (
    <form action={saveAgency} className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4">
      {a && <input type="hidden" name="id" value={a.id} />}
      <div><label className="text-xs text-slate-500">代理店名</label><input name="name" required defaultValue={a?.name} className={input} /></div>
      <div><label className="text-xs text-slate-500">区分</label>
        <select name="kind" defaultValue={a?.kind ?? "corporate"} className={input}>
          {(Object.keys(AGENCY_KINDS) as AgencyKind[]).map((k) => <option key={k} value={k}>{AGENCY_KINDS[k]}</option>)}
        </select></div>
      <div><label className="text-xs text-slate-500">標準の料率(%)</label><input name="default_rate" type="number" step="0.01" min={0} max={100} defaultValue={a?.default_rate ?? 0} className={input} /></div>
      <div><label className="text-xs text-slate-500">源泉徴収の率(%・税理士に確認)</label><input name="withholding_rate" type="number" step="0.001" min={0} max={100} defaultValue={a?.withholding_rate ?? 0} className={input} /></div>
      <div><label className="text-xs text-slate-500">インボイス番号(T+13桁)</label><input name="invoice_no" defaultValue={a?.invoice_no ?? ""} placeholder="T1234567890123" className={input} /></div>
      <div><label className="text-xs text-slate-500">メール</label><input name="email" defaultValue={a?.email ?? ""} className={input} /></div>
      <div className="sm:col-span-2"><label className="text-xs text-slate-500">メモ</label><input name="notes" defaultValue={a?.notes ?? ""} className={input} /></div>
      <div><label className="text-xs text-slate-500">銀行コード(4桁)</label><input name="bank_code" defaultValue={a?.bank_code ?? ""} className={input} /></div>
      <div><label className="text-xs text-slate-500">銀行名</label><input name="bank_name" defaultValue={a?.bank_name ?? ""} className={input} /></div>
      <div><label className="text-xs text-slate-500">支店コード(3桁)</label><input name="branch_code" defaultValue={a?.branch_code ?? ""} className={input} /></div>
      <div><label className="text-xs text-slate-500">支店名</label><input name="branch_name" defaultValue={a?.branch_name ?? ""} className={input} /></div>
      <div><label className="text-xs text-slate-500">預金種目</label>
        <select name="account_type" defaultValue={a?.account_type ?? ""} className={input}><option value="">未登録</option><option value="普通">普通</option><option value="当座">当座</option></select></div>
      <div><label className="text-xs text-slate-500">口座番号</label><input name="account_no" defaultValue={a?.account_no ?? ""} className={input} /></div>
      <div className="sm:col-span-2"><label className="text-xs text-slate-500">口座名義(カタカナ)</label><input name="account_holder_kana" defaultValue={a?.account_holder_kana ?? ""} className={input} /></div>
      <div className="flex flex-wrap items-center gap-4 sm:col-span-4">
        <label className="flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" name="deduct_invoice_gap" defaultChecked={a?.deduct_invoice_gap ?? true} /> インボイス未登録の事業者には、消費税の差し引けない分を手数料から引く(契約で事前に合意しておくこと。紹介者には適用されません)</label>
        <label className="flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" name="is_active" value="on" defaultChecked={a?.is_active ?? true} /> 有効(外すと、新しい入金から手数料を出しません)</label>
        <button className="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">{a ? "保存" : "追加"}</button>
      </div>
    </form>
  );
}

export default async function AdminAgenciesPage() {
  await requireRootAdmin();
  const supabase = await createClient();
  const t = billingDb(supabase);
  const since = new Date(Date.now() + 9 * 3600 * 1000 - 365 * 86400 * 1000).toISOString().slice(0, 7) + "-01";
  const [{ data: agencies }, { data: links }, { data: shops }, { data: yearRows }] = await Promise.all([
    t.from("locapass_agencies").select("*").order("created_at"),
    t.from("locapass_agency_shops").select("*").order("starts_on", { ascending: false }),
    supabase.from("locapass_shops").select("id, name").order("name").limit(1000),
    t.from("locapass_commissions").select("agency_id, commission").neq("status", "void").gte("month", since),
  ]);
  const yearTotal = new Map<string, number>();
  for (const r of (yearRows ?? []) as { agency_id: string; commission: number }[]) yearTotal.set(r.agency_id, (yearTotal.get(r.agency_id) ?? 0) + r.commission);
  const list = (agencies ?? []) as Agency[];
  const allLinks = (links ?? []) as ShopLink[];
  const shopName = new Map((shops ?? []).map((s) => [s.id, s.name]));
  const linkedShopIds = new Set(allLinks.filter((l) => !l.ended_on).map((l) => l.shop_id));

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/billing" className="text-sm text-slate-500 underline">← 掲載料・代理店手数料へ</Link>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">代理店</h1>
        <p className="mt-1 text-sm text-slate-600">
          店舗ごとに「どの代理店の紹介か」と料率を決めます。料率が空欄なら、代理店の標準の料率を使います。紹介関係は、終了するまで続きます(永久継続)。
          手数料は、入金を確認した時点の料率と金額で固定されます。口座が未登録の代理店は、振込の対象になりません。
        </p>
      </div>

      {list.map((a) => {
        const mine = allLinks.filter((l) => l.agency_id === a.id);
        return (
          <section key={a.id} className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900">{a.name}{!a.is_active && <span className="ml-2 text-xs font-normal text-slate-500">(無効)</span>}</h2>
            {(() => {
              const total = yearTotal.get(a.id) ?? 0;
              return (
                <div className={`rounded-lg border p-3 text-sm ${total >= ANNUAL_REVIEW_THRESHOLD ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-700"}`}>
                  直近12か月の手数料の合計: <b>{yen(total)}</b>
                  {total >= ANNUAL_REVIEW_THRESHOLD && (
                    <span className="ml-2">— 課税事業者になる目安(年1,000万円)に近づいています。区分と契約(インボイス登録の依頼など)の見直しを検討してください。</span>
                  )}
                </div>
              );
            })()}
            <AgencyForm a={a} />
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <div className="mb-2 font-semibold text-slate-700">紹介している店舗</div>
              {mine.length === 0 && <p className="text-slate-500">まだありません</p>}
              {mine.map((l) => (
                <div key={l.id} className="flex items-center justify-between border-t border-slate-100 py-1.5">
                  <span>{shopName.get(l.shop_id) ?? l.shop_id} — {l.rate ?? a.default_rate}%{l.rate === null ? "(標準)" : ""}<span className="ml-2 text-xs text-slate-500">{l.starts_on}〜{l.ended_on ?? "継続中"}</span></span>
                  {!l.ended_on && <form action={endAgencyLink.bind(null, l.id)}><button className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100">紹介を終了</button></form>}
                </div>
              ))}
              <form action={linkAgencyShop} className="mt-2 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-2">
                <input type="hidden" name="agency_id" value={a.id} />
                <label className="text-xs text-slate-500">店舗
                  <select name="shop_id" required className="ml-1 rounded border border-slate-300 px-2 py-1 text-sm">
                    <option value="">選ぶ</option>
                    {(shops ?? []).filter((s) => !linkedShopIds.has(s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label className="text-xs text-slate-500">この店舗の料率(%・空欄=標準)<input name="rate" type="number" step="0.01" min={0} max={100} className="ml-1 w-24 rounded border border-slate-300 px-2 py-1 text-sm" /></label>
                <button className="rounded bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white">紹介を追加</button>
              </form>
            </div>
          </section>
        );
      })}

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-slate-900">代理店を追加</h2>
        <AgencyForm />
      </section>
    </div>
  );
}
