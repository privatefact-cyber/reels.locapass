"use client";

import { useState, useTransition } from "react";
import { moveShopToPortal } from "@/app/admin/(console)/portals/actions";
import { LOCAPASS_CATEGORIES } from "@/lib/shop/locapassCategories";

/**
 * 店舗を別の子ポータルへ移す(ルート管理者のみ表示)。店舗情報・写真・パートナー・店舗管理者はそのまま、
 * 所属ポータルと(必要なら)業種だけを付け替える。
 */
export function MoveShopPortalForm({
  shopId,
  shopName,
  currentPortalId,
  currentCategory,
  portals,
}: {
  shopId: string;
  shopName: string;
  currentPortalId: number;
  currentCategory: string | null;
  portals: { id: number; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [toPortalId, setToPortalId] = useState<number | null>(null);
  const [category, setCategory] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const targets = portals.filter((p) => p.id !== currentPortalId);
  const target = targets.find((p) => p.id === toPortalId);

  function submit() {
    if (!target) return;
    const categoryLabel = category || currentCategory || "未設定";
    if (!window.confirm(`「${shopName}」を「${target.name}」へ移動します。\n業種: ${categoryLabel}\n\n店舗情報・写真・パートナー・リールはそのまま引き継がれます。よろしいですか？`)) return;
    setError(null);
    startTransition(async () => {
      try {
        await moveShopToPortal(shopId, target.id, category || null);
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "店舗の移動に失敗しました");
      }
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 text-xs text-slate-500 underline hover:text-slate-900">
        別のポータルへ移動
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <label className="block text-xs font-semibold text-slate-600">
        移動先のポータル
        <select
          value={toPortalId ?? ""}
          onChange={(e) => setToPortalId(e.target.value ? Number(e.target.value) : null)}
          className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
        >
          <option value="">選択してください</option>
          {targets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-semibold text-slate-600">
        業種
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
        >
          <option value="">変更しない({currentCategory || "未設定"})</option>
          {LOCAPASS_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!target || pending}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
        >
          {pending ? "移動中..." : "移動する"}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={pending} className="text-xs text-slate-500 hover:text-slate-900">
          キャンセル
        </button>
      </div>
      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
