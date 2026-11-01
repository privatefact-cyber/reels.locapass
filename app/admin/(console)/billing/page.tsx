import Link from "next/link";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { billingDb, monthParam, yen } from "@/lib/billing/db";
import { confirmPaid, createBatch, generateInvoices, markBatchPaid, voidInvoice } from "./actions";

export const dynamic = "force-dynamic";

type Invoice = { id: string; shop_id: string; month: string; list_amount: number; discount: number; amount: number; status: string; paid_at: string | null };
type Commission = { id: string; agency_id: string; shop_id: string; month: string; base_amount: number; rate: number; commission: number; withholding: number; tax_adjustment: number; status: string; batch_id: string | null };
type Batch = { id: string; transfer_date: string; total_gross: number; total_withholding: number; total_tax_adjustment: number; total_net: number; paid_at: string | null; note: string | null };

const INV_LABEL: Record<string, string> = { due: "入金待ち", paid: "入金済み", void: "取り消し" };
const COM_LABEL: Record<string, string> = { pending: "未払い", batched: "振込手配中", paid: "支払い済み", void: "取り消し" };

export default async function AdminBillingPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireRootAdmin();
  const sp = await searchParams;
  const month = monthParam(sp.month);
  const monthKey = month.slice(0, 7);

  const supabase = await createClient();
  const t = billingDb(supabase);
  const [{ data: invoices }, { data: commissions }, { data: batches }, { data: pending }] = await Promise.all([
    t.from("locapass_fee_invoices").select("*").eq("month", month).order("created_at"),
    t.from("locapass_commissions").select("*").eq("month", month).order("created_at"),
    t.from("locapass_payout_batches").select("*").order("created_at", { ascending: false }).limit(10),
    t.from("locapass_commissions").select("commission, withholding, tax_adjustment").eq("status", "pending"),
  ]);
  const inv = (invoices ?? []) as Invoice[];
  const com = (commissions ?? []) as Commission[];
  const bat = (batches ?? []) as Batch[];

  const ids = [...new Set([...inv.map((i) => i.shop_id), ...com.map((c) => c.shop_id)])];
  const agencyIds = [...new Set(com.map((c) => c.agency_id))];
  const [{ data: shops }, { data: agencies }] = await Promise.all([
    ids.length ? supabase.from("locapass_shops").select("id, name").in("id", ids) : Promise.resolve({ data: [] }),
    agencyIds.length ? t.from("locapass_agencies").select("id, name").in("id", agencyIds) : Promise.resolve({ data: [] }),
  ]);
  const shopName = new Map<string, string>((shops ?? []).map((x: { id: string; name: string }): [string, string] => [x.id, x.name]));
  const agencyName = new Map<string, string>((agencies ?? []).map((x: { id: string; name: string }): [string, string] => [x.id, x.name]));

  const pendingNet = ((pending ?? []) as { commission: number; withholding: number; tax_adjustment: number }[]).reduce((a, r) => a + r.commission - r.withholding - r.tax_adjustment, 0);
  const sum = (rows: Invoice[], st: string) => rows.filter((r) => r.status === st).reduce((a, r) => a + r.amount, 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">掲載料・代理店手数料</h1>
          <p className="mt-1 text-sm text-slate-600">
            月ごとに請求行を作り、入金を確認すると、紹介元の代理店の手数料が自動で確定します。決済APIにはつながっていません(入金の確認と銀行振込は手作業です)。
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link href="/admin/billing/plans" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100">プラン・割引・規約</Link>
          <Link href="/admin/billing/agencies" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100">代理店</Link>
        </div>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <label className="text-sm font-semibold text-slate-700">
            対象月
            <input type="month" name="month" defaultValue={monthKey} className="ml-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          </label>
          <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white">表示</button>
        </form>
        <form action={generateInvoices} className="mt-3 flex items-center gap-3">
          <input type="hidden" name="month" value={month} />
          <button className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">{monthKey} の請求行を作る</button>
          <span className="text-xs text-slate-500">有効な契約(月額が0円より大きいもの)から作ります。すでにある行は変わりません。</span>
        </form>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-500">請求合計</dt><dd className="text-lg font-bold">{yen(inv.filter((r) => r.status !== "void").reduce((a, r) => a + r.amount, 0))}</dd></div>
          <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-500">入金済み</dt><dd className="text-lg font-bold text-emerald-700">{yen(sum(inv, "paid"))}</dd></div>
          <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-500">入金待ち</dt><dd className="text-lg font-bold text-amber-700">{yen(sum(inv, "due"))}</dd></div>
        </dl>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-bold text-slate-900">請求行({inv.length}件)</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-2">店舗</th><th className="p-2">定価</th><th className="p-2">割引</th><th className="p-2">請求額</th><th className="p-2">状態</th><th className="p-2"></th></tr></thead>
            <tbody>
              {inv.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-slate-500">この月の請求行はありません</td></tr>}
              {inv.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="p-2">{shopName.get(r.shop_id) ?? r.shop_id}</td>
                  <td className="p-2">{yen(r.list_amount)}</td>
                  <td className="p-2">{r.discount ? `-${yen(r.discount)}` : "—"}</td>
                  <td className="p-2 font-semibold">{yen(r.amount)}</td>
                  <td className="p-2">{INV_LABEL[r.status] ?? r.status}</td>
                  <td className="flex gap-2 p-2">
                    {r.status === "due" && (
                      <>
                        <form action={confirmPaid.bind(null, r.id)}><button className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700">入金を確認</button></form>
                        <form action={voidInvoice.bind(null, r.id)}><button className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">取り消し</button></form>
                      </>
                    )}
                    {r.status === "paid" && (
                      <form action={voidInvoice.bind(null, r.id)}><button className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">取り消し</button></form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-bold text-slate-900">この月の代理店手数料({com.length}件)</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-2">代理店</th><th className="p-2">店舗</th><th className="p-2">入金額</th><th className="p-2">料率</th><th className="p-2">手数料</th><th className="p-2">源泉</th><th className="p-2">消費税の差額</th><th className="p-2">状態</th></tr></thead>
            <tbody>
              {com.length === 0 && <tr><td colSpan={8} className="p-4 text-center text-slate-500">入金を確認すると、紹介元がある店舗の手数料がここに出ます</td></tr>}
              {com.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="p-2">{agencyName.get(c.agency_id) ?? c.agency_id}</td>
                  <td className="p-2">{shopName.get(c.shop_id) ?? c.shop_id}</td>
                  <td className="p-2">{yen(c.base_amount)}</td>
                  <td className="p-2">{c.rate}%</td>
                  <td className="p-2 font-semibold">{yen(c.commission)}</td>
                  <td className="p-2">{c.withholding ? `-${yen(c.withholding)}` : "—"}</td>
                  <td className="p-2">{c.tax_adjustment ? `-${yen(c.tax_adjustment)}` : "—"}</td>
                  <td className="p-2">{COM_LABEL[c.status] ?? c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold text-slate-900">代理店への振込</h2>
        <p className="mt-1 text-sm text-slate-600">
          未払いの手数料(振込額の合計 <b>{yen(pendingNet)}</b>)を、1つの「振込のまとまり」にします。口座が未登録の代理店の分は、未払いのまま残ります。
          作ったあと、CSVをダウンロードして銀行で振り込み、済んだら「振込済みにする」を押してください。
        </p>
        <form action={createBatch} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm font-semibold text-slate-700">振込日<input type="date" name="transfer_date" required className="ml-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" /></label>
          <label className="text-sm font-semibold text-slate-700">メモ<input type="text" name="note" maxLength={100} className="ml-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" /></label>
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">振込のまとまりを作る</button>
        </form>

        <div className="mt-4 space-y-2">
          {bat.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm">
              <div>
                <b>{b.transfer_date}</b>{b.note ? ` ${b.note}` : ""} — 手数料 {yen(b.total_gross)} / 源泉 -{yen(b.total_withholding)} / 消費税の差額 -{yen(b.total_tax_adjustment)} / <b>振込額 {yen(b.total_net)}</b>
                <span className="ml-2 text-xs text-slate-500">{b.paid_at ? "振込済み" : "未振込"}</span>
              </div>
              <div className="flex gap-2">
                <a href={`/admin/billing/batch/${b.id}/csv`} className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">CSVをダウンロード</a>
                {!b.paid_at && <form action={markBatchPaid.bind(null, b.id)}><button className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700">振込済みにする</button></form>}
              </div>
            </div>
          ))}
          {bat.length === 0 && <p className="text-sm text-slate-500">まだ振込のまとまりはありません</p>}
        </div>
      </section>
    </div>
  );
}
