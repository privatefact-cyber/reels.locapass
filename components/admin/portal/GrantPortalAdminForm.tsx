"use client";

import { useActionState } from "react";
import { grantPortalAdmin, type IssuedLoginState } from "@/app/admin/(console)/portals/actions";
import { IssuedLoginNotice } from "./IssuedLoginNotice";

export function GrantPortalAdminForm({ portalId }: { portalId: number }) {
  const [state, formAction, pending] = useActionState<IssuedLoginState, FormData>(
    grantPortalAdmin.bind(null, portalId),
    { status: "idle" },
  );

  return (
    <div>
      <form action={formAction} className="flex flex-wrap gap-2">
        <input
          name="email"
          type="email"
          required
          placeholder="招待するメールアドレス"
          className="min-w-[240px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "付与中..." : "ポータル管理者にする"}
        </button>
      </form>
      <p className="mt-1 text-[11px] text-slate-400">
        未登録のメールアドレスならアカウントを作成し、初期パスワードを表示します。登録済みなら権限だけ付与します。
      </p>
      {state.status === "error" && <p className="mt-2 text-sm text-red-600">{state.message}</p>}
      {state.status === "success" && (
        <IssuedLoginNotice loginEmail={state.loginEmail} password={state.initialPassword} />
      )}
    </div>
  );
}
