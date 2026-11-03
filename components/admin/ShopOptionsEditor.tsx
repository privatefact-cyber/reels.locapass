"use client";

import { useState, useTransition } from "react";
import { ShopSearchPicker, type ShopHit } from "@/components/admin/ShopSearchPicker";
import type { ShopOptionState } from "@/lib/shop-options";

/** 店舗を検索して選ぶと、その店舗のオプションがチェックボックスで出る。チェックを切り替えると、その場で保存される。 */
export function ShopOptionsEditor({
  search,
  load,
  save,
}: {
  search: (q: string) => Promise<ShopHit[]>;
  load: (shopId: string) => Promise<ShopOptionState[]>;
  save: (shopId: string, key: string, enabled: boolean) => Promise<ShopOptionState[]>;
}) {
  const [shop, setShop] = useState<ShopHit | null>(null);
  const [states, setStates] = useState<ShopOptionState[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSelect(h: ShopHit | null) {
    setShop(h);
    setStates(null);
    setMsg(null);
    if (!h) return;
    startTransition(async () => {
      try {
        setStates(await load(h.id));
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "読み込みに失敗しました");
      }
    });
  }

  function toggle(key: string, enabled: boolean) {
    if (!shop) return;
    setMsg(null);
    startTransition(async () => {
      try {
        setStates(await save(shop.id, key, enabled));
        setMsg("保存しました");
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "保存に失敗しました");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex">
        <ShopSearchPicker name="shop_id" search={search} placeholder="店舗名で検索して、設定する店舗を選ぶ" onSelect={onSelect} />
      </div>
      {shop && (
        <div className="space-y-2">
          {!states && <p className="text-xs text-slate-500">読み込み中...</p>}
          {states?.map((s) => (
            <label key={s.key} className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
              <input
                type="checkbox"
                checked={s.enabled}
                disabled={pending}
                onChange={(e) => toggle(s.key, e.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-900">{s.label}</span>
                <span className="block text-xs text-slate-500">{s.description}</span>
              </span>
            </label>
          ))}
          {msg && <p className="text-xs text-slate-600">{msg}</p>}
        </div>
      )}
    </div>
  );
}
