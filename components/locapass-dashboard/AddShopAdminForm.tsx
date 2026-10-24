"use client";

import { useActionState, useState } from "react";
import type { AddAdminState } from "@/app/dashboard/shop/[shopId]/admins/actions";

/** 管理者ID追加フォーム。発行直後の初期パスワードは、この画面で1度だけ表示する(再表示不可)。 */
export function AddShopAdminForm({
  action,
  disabled,
  loginUrl,
}: {
  action: (prev: AddAdminState, fd: FormData) => Promise<AddAdminState>;
  disabled: boolean;
  loginUrl: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [copied, setCopied] = useState(false);
  const input =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

  const copy = async () => {
    if (!state?.ok) return;
    try {
      await navigator.clipboard.writeText(`ログインURL: ${loginUrl}\nID: ${state.email}\nパスワード: ${state.password}`);
      setCopied(true);
    } catch {
      // コピーできない端末では、画面の表示を見て控えてもらう。
    }
  };

  return (
    <div className="space-y-3">
      <form action={formAction} className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-slate-600">
          ログインID(メールアドレス・空欄なら自動で作ります。本人が受け取れるメールにすると、パスワードを忘れたとき、メールで再設定できます)
          <input name="email" type="email" placeholder="例: manager@example.com" disabled={disabled} className={`${input} mt-1 font-normal`} />
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          パスワード(6文字以上・空欄なら自動で作ります)
          <input name="password" type="text" minLength={6} autoComplete="off" disabled={disabled} className={`${input} mt-1 font-normal`} />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending || disabled}
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
          >
            {pending ? "発行中…" : "管理者IDを発行"}
          </button>
        </div>
      </form>

      {state && !state.ok && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}

      {state?.ok && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm">
          <p className="font-semibold text-emerald-800">発行しました。パスワードはこの画面でしか表示されません。必ず控えて、本人にお伝えください。</p>
          <dl className="mt-2 space-y-1 text-slate-800">
            <div className="flex gap-2"><dt className="w-24 shrink-0 text-slate-500">ログインURL</dt><dd className="break-all font-mono">{loginUrl}</dd></div>
            <div className="flex gap-2"><dt className="w-24 shrink-0 text-slate-500">ログインID</dt><dd className="break-all font-mono">{state.email}</dd></div>
            <div className="flex gap-2"><dt className="w-24 shrink-0 text-slate-500">パスワード</dt><dd className="font-mono">{state.password}</dd></div>
          </dl>
          <button type="button" onClick={copy} className="mt-3 rounded-lg border border-emerald-400 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800">
            {copied ? "コピーしました" : "URL・ID・パスワードをコピー"}
          </button>
        </div>
      )}
    </div>
  );
}
