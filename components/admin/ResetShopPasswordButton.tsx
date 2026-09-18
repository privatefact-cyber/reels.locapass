"use client";

import { useActionState } from "react";
import { resetShopLoginPassword, type ResetPasswordState } from "@/app/admin/(console)/actions";

export function ResetShopPasswordButton({ shopStaffId }: { shopStaffId: string }) {
  const boundReset = resetShopLoginPassword.bind(null, shopStaffId);
  const [state, formAction, pending] = useActionState<ResetPasswordState, FormData>(boundReset, {
    status: "idle",
  });

  return (
    <form action={formAction} className="space-y-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        {pending ? "再発行中..." : "パスワードを再発行"}
      </button>

      {state.status === "success" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs">
          <p className="font-semibold text-amber-900">
            新しいパスワードです。この情報は今だけ表示されます。店舗担当者に伝えてください。
          </p>
          <p className="mt-1.5 select-all font-mono text-sm text-slate-900">{state.newPassword}</p>
        </div>
      )}

      {state.status === "error" && <p className="text-xs text-red-600">{state.message}</p>}
    </form>
  );
}
