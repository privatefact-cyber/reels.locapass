"use client";

import { useActionState, useState, useTransition } from "react";
import {
  grantShopAdmin,
  resetShopAdminPassword,
  revokeShopAdmin,
  deletePortalShop,
  revokePortalAdmin,
  type IssuedLoginState,
  type ResetPasswordState,
} from "@/app/admin/(console)/portals/actions";
import { IssuedLoginNotice } from "./IssuedLoginNotice";

/** 店舗に shop_admin のログインを追加発行する(折りたたみ)。 */
export function GrantShopAdminForm({ portalId, shopId }: { portalId: number; shopId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<IssuedLoginState, FormData>(
    grantShopAdmin.bind(null, portalId, shopId),
    { status: "idle" },
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-indigo-600 hover:underline"
      >
        + 店舗管理者のログインを発行
      </button>
    );
  }

  return (
    <div className="mt-1">
      <form action={formAction} className="flex flex-wrap gap-2">
        <input
          name="email"
          type="email"
          placeholder="メール(空欄なら自動発行)"
          className="min-w-[200px] flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "発行中..." : "発行"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500">
          閉じる
        </button>
      </form>
      {state.status === "error" && <p className="mt-1 text-xs text-red-600">{state.message}</p>}
      {state.status === "success" && (
        <IssuedLoginNotice loginEmail={state.loginEmail} password={state.initialPassword} />
      )}
    </div>
  );
}

/** 発行済み shop_admin のパスワード再発行(自動発行したログインIDのみ)。 */
export function ResetShopAdminPasswordButton({ portalId, shopAdminId }: { portalId: number; shopAdminId: string }) {
  const [state, formAction, pending] = useActionState<ResetPasswordState, FormData>(
    resetShopAdminPassword.bind(null, portalId, shopAdminId),
    { status: "idle" },
  );

  return (
    <div>
      <form
        action={formAction}
        onSubmit={(e) => {
          if (!confirm("このログインのパスワードを再発行します。今のパスワードは使えなくなります。よろしいですか？")) {
            e.preventDefault();
          }
        }}
      >
        <button type="submit" disabled={pending} className="text-xs text-slate-500 hover:text-slate-900 disabled:opacity-50">
          {pending ? "再発行中..." : "パスワード再発行"}
        </button>
      </form>
      {state.status === "error" && <p className="mt-1 text-xs text-red-600">{state.message}</p>}
      {state.status === "success" && (
        <IssuedLoginNotice loginEmail={state.loginEmail} password={state.newPassword} passwordLabel="新しいパスワード" />
      )}
    </div>
  );
}

/** 確認ダイアログ付きの危険操作ボタン(権限解除・店舗削除)。 */
function ConfirmButton({
  label,
  pendingLabel,
  confirmMessage,
  onConfirm,
  className,
}: {
  label: string;
  pendingLabel: string;
  confirmMessage: string;
  onConfirm: () => Promise<void>;
  className: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span>
      <button
        type="button"
        disabled={pending}
        className={className}
        onClick={() => {
          if (!confirm(confirmMessage)) return;
          setError(null);
          startTransition(async () => {
            try {
              await onConfirm();
            } catch (e) {
              setError(e instanceof Error ? e.message : "処理に失敗しました");
            }
          });
        }}
      >
        {pending ? pendingLabel : label}
      </button>
      {error && <span className="ml-2 text-xs text-red-600">{error}</span>}
    </span>
  );
}

export function RevokeShopAdminButton({
  portalId,
  shopAdminId,
  email,
}: {
  portalId: number;
  shopAdminId: string;
  email: string;
}) {
  return (
    <ConfirmButton
      label="権限を解除"
      pendingLabel="解除中..."
      confirmMessage={`${email} の店舗管理者権限を解除します。よろしいですか？`}
      onConfirm={() => revokeShopAdmin(portalId, shopAdminId)}
      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
    />
  );
}

export function RevokePortalAdminButton({
  portalId,
  userId,
  email,
}: {
  portalId: number;
  userId: string;
  email: string;
}) {
  return (
    <ConfirmButton
      label="権限を解除"
      pendingLabel="解除中..."
      confirmMessage={`${email} のポータル管理者権限を解除します。よろしいですか？`}
      onConfirm={() => revokePortalAdmin(portalId, userId)}
      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
    />
  );
}

export function DeleteShopButton({ portalId, shopId, shopName }: { portalId: number; shopId: string; shopName: string }) {
  return (
    <ConfirmButton
      label="削除"
      pendingLabel="削除中..."
      confirmMessage={`「${shopName}」を削除します。この店舗のリール・ログイン権限なども全て削除され、元に戻せません。よろしいですか？`}
      onConfirm={() => deletePortalShop(portalId, shopId)}
      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
    />
  );
}
