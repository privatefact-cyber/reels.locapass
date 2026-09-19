"use client";

import { CopyButton } from "@/components/locapass-dashboard/CopyButton";

/** 発行したログイン情報を、その場で一度だけ見せる(パスワードはDBに平文で残らないため再表示できない)。 */
export function IssuedLoginNotice({
  loginEmail,
  password,
  passwordLabel = "初期パスワード",
}: {
  loginEmail: string;
  password: string | null;
  passwordLabel?: string;
}) {
  return (
    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-emerald-700">ログインID</span>
        <code className="rounded bg-white px-2 py-0.5 font-mono text-xs text-slate-900">{loginEmail}</code>
        <CopyButton value={loginEmail} />
      </div>
      {password ? (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-emerald-700">{passwordLabel}</span>
            <code className="rounded bg-white px-2 py-0.5 font-mono text-xs text-slate-900">{password}</code>
            <CopyButton value={password} />
          </div>
          <p className="mt-2 text-[11px] text-emerald-700">
            パスワードはこの画面を閉じると再表示できません。必ず控えてから本人に渡してください。
          </p>
        </>
      ) : (
        <p className="mt-2 text-[11px] text-emerald-700">
          既に登録済みのアカウントに権限を付与しました。パスワードは本人が使っているもののままです。
        </p>
      )}
    </div>
  );
}
