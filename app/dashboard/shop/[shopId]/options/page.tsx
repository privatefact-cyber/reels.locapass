import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import { OPTION_COLUMNS, statesFromRow } from "@/lib/shop-options";

/** 店舗のオプション一覧(いまはご利用状況の確認のみ。申し込みボタンは準備中)。オン/オフの変更は運営者が行う。 */
export default async function LocapassShopOptionsPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const viewer = await getShopForManager(shopId);
  if (!viewer) notFound();

  const supabase = (await createClient()) as any;
  const { data: row } = await supabase.from("locapass_shops").select(OPTION_COLUMNS).eq("id", viewer.shop.id).maybeSingle();
  const states = statesFromRow(row);

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs text-slate-500">{viewer.shop.name}</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">オプション</h1>
        <p className="mt-1 text-sm text-slate-600">
          追加でご利用いただける機能の一覧です。ご利用中のオプションにチェックが付きます。お申し込みの受付は準備中です。
        </p>
      </section>
      <ul className="space-y-3">
        {states.map((s) => (
          <li key={s.key} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <input type="checkbox" checked={s.enabled} disabled readOnly className="mt-1 h-4 w-4" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">{s.label}</h2>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                >
                  {s.enabled ? "ご利用中" : "未契約"}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{s.description}</p>
              {!s.enabled && (
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  className="mt-2 cursor-not-allowed rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-400"
                >
                  オプションを追加(準備中)
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
