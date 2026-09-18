"use client";

import { useActionState } from "react";
import { issueShopLogin, type IssueLoginState } from "@/app/admin/(console)/actions";

export function IssueShopLoginButton({ shopId }: { shopId: string }) {
  const boundIssue = issueShopLogin.bind(null, shopId);
  const [state, formAction, pending] = useActionState<IssueLoginState, FormData>(boundIssue, {
    status: "idle",
  });

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-600">
          ログインID(任意。空欄なら店舗コードから自動採番)
        </label>
        <input
          name="login_id"
          type="text"
          placeholder="例: liric-roppongi(空欄でOK)"
          className="mt-1 w-full max-w-xs rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
        <p className="mt-1 text-[11px] text-slate-400">
          「@」を付けなければ自動で @shop.modella.local が付きます。現場に伝えやすい短い英数字がおすすめです。
        </p>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {pending ? "発行中..." : "新しいログインを発行する"}
      </button>

      {state.status === "success" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-semibold text-amber-900">
            この情報は今だけ表示されます。必ず店舗担当者に伝えてください。
          </p>
          <dl className="mt-2 space-y-1">
            <div>
              <dt className="text-xs text-amber-700/70">ログインID</dt>
              <dd className="select-all font-mono text-sm text-slate-900">{state.loginEmail}</dd>
            </div>
            <div>
              <dt className="text-xs text-amber-700/70">初期パスワード</dt>
              <dd className="select-all font-mono text-sm text-slate-900">{state.initialPassword}</dd>
            </div>
          </dl>
        </div>
      )}

      {state.status === "error" && <p className="text-sm text-red-600">{state.message}</p>}
    </form>
  );
}
