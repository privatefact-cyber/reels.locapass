"use client";

import { useActionState } from "react";
import { inviteCast, type InviteCastState } from "@/app/dashboard/shop/[shopId]/cast/actions";

export function InviteCastButton({ shopId, castId, hasLogin }: { shopId: string; castId: string; hasLogin: boolean }) {
  const boundInvite = inviteCast.bind(null, shopId, castId);
  const [state, formAction, pending] = useActionState<InviteCastState, FormData>(
    boundInvite,
    { status: "idle" },
  );

  return (
    <form action={formAction} className="space-y-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
      >
        {pending ? "発行中..." : hasLogin ? "パスワードを再発行する" : "ログインを発行する"}
      </button>

      {state.status === "success" && (
        <div className="rounded border border-amber-400 bg-amber-50 p-3 text-sm">
          <p className="font-semibold text-amber-800">
            この情報は今だけ表示されます。必ずキャスト本人に伝えてください。
          </p>
          <dl className="mt-2 space-y-1">
            <div>
              <dt className="text-xs text-black/50">ログインID(メールアドレス欄に入力)</dt>
              <dd className="select-all font-mono text-sm text-black">{state.loginEmail}</dd>
            </div>
            <div>
              <dt className="text-xs text-black/50">初期パスワード</dt>
              <dd className="select-all font-mono text-sm text-black">{state.initialPassword}</dd>
            </div>
          </dl>
        </div>
      )}

      {state.status === "error" && (
        <p className="text-sm text-red-600">{state.message}</p>
      )}
    </form>
  );
}
