"use client";

import { useActionState } from "react";
import type { ShopHit } from "./ShopSearchPicker";
import { ShopCastPicker, type CastOption } from "./ShopCastPicker";

export type BulkEmbedState = { rows: { line: string; ok: boolean; message: string }[] } | null;

/**
 * 外部動画のURLを、何本もまとめて追加する入力欄。
 * 店舗(とキャスト)は1回選ぶだけで、貼ったURL全部に同じ設定がかかる。
 */
export function BulkEmbedForm({
  action,
  searchShops,
  listCasts,
  castFieldName,
}: {
  action: (prev: BulkEmbedState, formData: FormData) => Promise<BulkEmbedState>;
  searchShops: (q: string) => Promise<ShopHit[]>;
  listCasts: (shopId: string) => Promise<CastOption[]>;
  castFieldName?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const okCount = state?.rows.filter((r) => r.ok).length ?? 0;
  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
      <div>
        <h2 className="text-base font-bold text-slate-900">まとめて追加(リールのみ)</h2>
        <p className="mt-1 text-xs text-slate-600">URLを1行に1本ずつ貼ります(最大30本)。店舗とキャストは下で1回選ぶだけで、全部に同じ設定がかかります。Instagramのサムネイルは、あとから一覧で1本ずつ差し替えます。</p>
      </div>
      <div>
        <label className="block text-sm font-semibold text-slate-700">店舗</label>
        <ShopCastPicker searchShops={searchShops} listCasts={listCasts} castFieldName={castFieldName} />
      </div>
      <div>
        <label className="block text-sm font-semibold text-slate-700">動画のURL(1行に1本)</label>
        <textarea name="urls" rows={8} required placeholder={"https://www.instagram.com/reel/xxxx/\nhttps://www.tiktok.com/@user/video/123\nhttps://youtube.com/shorts/xxxx"} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-500" />
      </div>
      <button type="submit" disabled={pending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
        {pending ? "登録中…(本数が多いと少し時間がかかります)" : "まとめて追加する"}
      </button>
      {state && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
          <p className="mb-2 font-semibold text-slate-900">
            {state.rows.length}本中 {okCount}本を追加しました{okCount < state.rows.length ? `(${state.rows.length - okCount}本は追加できませんでした)` : ""}
          </p>
          <ul className="space-y-1">
            {state.rows.map((r, i) => (
              <li key={i} className={r.ok ? "text-emerald-700" : "text-red-600"}>
                {r.ok ? "✓" : "✗"} <span className="break-all">{r.line}</span> — {r.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
