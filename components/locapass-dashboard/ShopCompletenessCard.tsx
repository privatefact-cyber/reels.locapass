import Link from "next/link";
import type { CompletenessItem } from "@/lib/shop/profileCompleteness";

/** 店舗ダッシュボード上部に出す「掲載の充実度」。足りない項目を重要な順に並べ、入力場所へ飛べるようにする。 */
export function ShopCompletenessCard({ percent, items }: { percent: number; items: CompletenessItem[] }) {
  const missing = items.filter((i) => !i.done).sort((a, b) => b.weight - a.weight);
  const barColor = percent >= 80 ? "bg-emerald-500" : percent >= 50 ? "bg-hl-500" : "bg-rose-500";

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">掲載の充実度</h2>
          <p className="mt-1 text-xs text-slate-500">
            {missing.length === 0
              ? "すべての項目がそろっています。お客さんに選ばれやすい状態です。"
              : "足りない項目を埋めるほど、マップや一覧でお客さんに選ばれやすくなります。"}
          </p>
        </div>
        <p className="text-3xl font-bold text-slate-900">
          {percent}
          <span className="text-base font-semibold text-slate-500">%</span>
        </p>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${percent}%` }} />
      </div>

      {missing.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100">
          {missing.map((item) => (
            <li key={item.key} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">
                  {item.label}
                  <span className="ml-2 text-xs font-normal text-slate-400">+{item.weight}点</span>
                </p>
                <p className="text-xs text-slate-500">{item.hint}</p>
              </div>
              {item.href.startsWith("#") ? (
                <a
                  href={item.href}
                  className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  入力する
                </a>
              ) : (
                <Link
                  href={item.href}
                  className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  入力する
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
