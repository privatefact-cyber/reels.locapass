"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateShopBusinessType } from "@/app/admin/(console)/portals/actions";
import { BUSINESS_TYPES, VERTICALS, isBusinessType } from "@/lib/verticals/registry";

/**
 * 店舗の業態(lib/verticals/registry.ts)。業態によって、この画面に出る属性が変わる。
 * 変更できるのはルート管理者だけ(canChange)。それ以外は表示だけ。
 * 変えても属性のデータは消さない(新しい業態で出さない属性は、表示されなくなるだけ)。
 */
export function BusinessTypeControl({
  shopId,
  current,
  canChange,
}: {
  shopId: string;
  current: string | null;
  canChange: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(isBusinessType(current) ? current : "");
  const [message, setMessage] = useState<string | null>(null);
  const label = isBusinessType(current) ? `${VERTICALS[current].icon} ${VERTICALS[current].label.ja}` : "未設定";

  function save() {
    if (!value || value === current) return;
    setMessage(null);
    startTransition(async () => {
      try {
        await updateShopBusinessType(shopId, value);
        setMessage("業態を変更しました。");
        router.refresh();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "保存に失敗しました");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="text-xs font-semibold text-slate-500">業態</span>
      {canChange ? (
        <>
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={pending}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
          >
            {!isBusinessType(current) && <option value="">未設定</option>}
            {BUSINESS_TYPES.map((bt) => (
              <option key={bt} value={bt}>
                {VERTICALS[bt].icon} {VERTICALS[bt].label.ja}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={save}
            disabled={pending || !value || value === current}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            {pending ? "変更中..." : "業態を変更する"}
          </button>
          <span className="text-xs text-slate-400">運営のみ変更できます。入力済みの属性は消えません。</span>
        </>
      ) : (
        <>
          <span className="font-semibold text-slate-900">{label}</span>
          <span className="text-xs text-slate-400">業態の変更は運営にご連絡ください。</span>
        </>
      )}
      {message && <p className="w-full text-xs text-slate-600">{message}</p>}
    </div>
  );
}
