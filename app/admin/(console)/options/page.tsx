import { requireAdmin } from "@/lib/admin/require-admin";
import { ShopOptionsEditor } from "@/components/admin/ShopOptionsEditor";
import { SHOP_OPTIONS } from "@/lib/shop-options";
import { applyShopOptions, getShopsOptionStates, searchShopsForOptions } from "./actions";

export default async function AdminOptionsPage() {
  await requireAdmin();
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">オプション管理</h1>
        <p className="mt-1 text-sm text-slate-600">
          店舗を検索して、1店舗でも複数店舗でも選べます。オプションを「オンにする/オフにする」から選んで「更新する」を押すと、まとめて反映されます。反映後に、データベースを読み直した実際の状態が一覧で出ます。
        </p>
      </div>
      <section className="rounded-lg border border-slate-200 bg-slate-50 p-5">
        <ShopOptionsEditor search={searchShopsForOptions} load={getShopsOptionStates} apply={applyShopOptions} />
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">オプションの種類</h2>
        <ul className="space-y-1 text-xs text-slate-600">
          {SHOP_OPTIONS.map((o) => (
            <li key={o.key}>
              <span className="font-semibold text-slate-800">{o.label}</span>: {o.description}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
