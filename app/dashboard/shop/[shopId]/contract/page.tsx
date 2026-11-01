import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import { billingDb, yen } from "@/lib/billing/db";
import { agreeContract } from "./actions";

export const dynamic = "force-dynamic";

type Plan = { code: string; name: string; monthly_fee: number; description: string | null };
type Promo = { id: string; plan_code: string; name: string; kind: "percent" | "amount"; value: number; months: number; starts_on: string | null; ends_on: string | null };
type Contract = { id: string; plan_code: string; monthly_fee: number; promo_kind: string | null; promo_value: number | null; promo_months: number | null; agreed_at: string; started_on: string };
type Invoice = { id: string; month: string; amount: number; discount: number; status: string };

const STATUS: Record<string, string> = { due: "お支払い待ち", paid: "お支払い済み", void: "取り消し" };

export default async function ShopContractPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const viewer = await getShopForManager(shopId);
  if (!viewer) notFound();

  const t = billingDb(await createClient());
  const [plansRes, termsRes, promosRes, contractRes, invoicesRes] = await Promise.all([
    t.from("locapass_plans").select("code, name, monthly_fee, description").eq("is_public", true).order("sort_order"),
    t.from("locapass_contract_terms").select("id, title, body, published_at").not("published_at", "is", null).order("published_at", { ascending: false }).limit(1),
    t.from("locapass_plan_promos").select("*").eq("is_active", true),
    t.from("locapass_shop_contracts").select("*").eq("shop_id", shopId).eq("status", "active").maybeSingle(),
    t.from("locapass_fee_invoices").select("id, month, amount, discount, status").eq("shop_id", shopId).order("month", { ascending: false }).limit(12),
  ]);

  // 仕組みの準備(DBの反映)がまだのとき
  if (plansRes.error) {
    return (
      <div className="mx-auto max-w-xl rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
        掲載プランの契約は、まもなくご利用いただけます。
      </div>
    );
  }

  const plans = (plansRes.data ?? []) as Plan[];
  const terms = (termsRes.data ?? [])[0] as { id: string; title: string; body: string } | undefined;
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const promos = ((promosRes.data ?? []) as Promo[]).filter((p) => (!p.starts_on || p.starts_on <= today) && (!p.ends_on || p.ends_on >= today));
  const contract = contractRes.data as Contract | null;
  const invoices = (invoicesRes.data ?? []) as Invoice[];
  const planName = (code: string) => plans.find((p) => p.code === code)?.name ?? code;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-black text-slate-900">掲載プランのご契約</h1>
        <p className="mt-1 text-sm text-slate-600">プランを選び、契約内容に同意すると、その場で契約が完了します。</p>
      </div>

      {contract && (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <div className="font-bold text-emerald-900">現在のご契約: {planName(contract.plan_code)}({yen(contract.monthly_fee)}/月)</div>
          <div className="mt-1 text-emerald-800">
            契約日 {contract.started_on}
            {contract.promo_kind && contract.promo_months
              ? ` / 期間割引: ${contract.promo_kind === "percent" ? `${contract.promo_value}%引き` : `${yen(contract.promo_value)}引き`} × 契約月から${contract.promo_months}か月`
              : ""}
          </div>
        </section>
      )}

      {!terms || plans.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">現在、ご契約いただけるプランはありません。</p>
      ) : (
        <form action={agreeContract.bind(null, shopId)} className="space-y-5 rounded-lg border border-slate-200 bg-white p-5">
          <input type="hidden" name="terms_id" value={terms.id} />
          <fieldset className="space-y-2">
            <legend className="text-sm font-bold text-slate-900">プランを選ぶ</legend>
            {plans.map((p) => (
              <div key={p.code} className="rounded-lg border border-slate-200 p-3">
                <label className="flex items-start gap-3">
                  <input type="radio" name="plan_code" value={p.code} required defaultChecked={contract?.plan_code === p.code} className="mt-1" />
                  <span>
                    <span className="font-bold text-slate-900">{p.name}</span>
                    <span className="ml-2 text-slate-700">{yen(p.monthly_fee)}/月</span>
                    {p.description && <span className="mt-0.5 block text-xs text-slate-500">{p.description}</span>}
                  </span>
                </label>
                {promos.filter((x) => x.plan_code === p.code).map((x) => (
                  <label key={x.id} className="ml-7 mt-2 flex items-center gap-2 text-xs text-amber-800">
                    <input type="radio" name="promo_id" value={x.id} />
                    {x.name}({x.kind === "percent" ? `${x.value}%引き` : `${yen(x.value)}引き`}・契約月から${x.months}か月)を適用する
                  </label>
                ))}
              </div>
            ))}
            <label className="flex items-center gap-2 text-xs text-slate-500"><input type="radio" name="promo_id" value="" defaultChecked /> 期間割引を使わない</label>
          </fieldset>

          <div>
            <div className="mb-1 text-sm font-bold text-slate-900">{terms.title}</div>
            <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">{terms.body}</div>
          </div>

          <label className="flex items-start gap-2 text-sm text-slate-800">
            <input type="checkbox" name="agree" className="mt-1" required />
            上記の契約書の内容と、選んだプランの金額・期間割引に同意します。(同意した日時と契約書の版が記録されます)
          </label>
          <button className="w-full rounded-lg bg-rose-600 px-4 py-3 text-sm font-bold text-white hover:bg-rose-700">同意して契約する</button>
        </form>
      )}

      {invoices.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold text-slate-900">ご請求の履歴</h2>
          <div className="rounded-lg border border-slate-200 bg-white text-sm">
            {invoices.map((i) => (
              <div key={i.id} className="flex items-center justify-between border-b border-slate-100 px-3 py-2 last:border-0">
                <span>{i.month.slice(0, 7)}</span>
                <span>{yen(i.amount)}{i.discount ? `(割引 -${yen(i.discount)})` : ""}</span>
                <span className="text-xs text-slate-500">{STATUS[i.status] ?? i.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
