"use client";

import { useState } from "react";
import { ShopSearchPicker, type ShopHit } from "./ShopSearchPicker";

export type CastOption = { id: string; name: string };

/**
 * 店舗を選んだあとに、その店舗のキャスト・スタッフ(任意)を選べる入力欄。
 * 選ばなければ店舗のリール、選べばその人のリールとして追加される。
 */
export function ShopCastPicker({
  shopFieldName = "shop_id",
  castFieldName = "member",
  castLabel = "キャスト・スタッフ(任意)",
  searchShops,
  listCasts,
}: {
  shopFieldName?: string;
  castFieldName?: string;
  castLabel?: string;
  searchShops: (q: string) => Promise<ShopHit[]>;
  listCasts: (shopId: string) => Promise<CastOption[]>;
}) {
  const [casts, setCasts] = useState<CastOption[]>([]);
  const [loading, setLoading] = useState(false);

  async function onSelect(shop: ShopHit | null) {
    setCasts([]);
    if (!shop) return;
    setLoading(true);
    try {
      setCasts(await listCasts(shop.id));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="mt-1 flex"><ShopSearchPicker name={shopFieldName} search={searchShops} onSelect={onSelect} /></div>
      <div className="mt-3">
        <label className="block text-sm font-semibold text-slate-700">{castLabel}</label>
        <select name={castFieldName} defaultValue="" disabled={loading || casts.length === 0} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900">
          <option value="">{loading ? "読み込み中..." : casts.length === 0 ? "(店舗を選ぶと候補が出ます / 該当者なし)" : "選ばない(店舗のリールにする)"}</option>
          {casts.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-slate-500">選ぶと、その人の投稿として表示されます(リールのみ。イベントでは使いません)。</p>
      </div>
    </>
  );
}
