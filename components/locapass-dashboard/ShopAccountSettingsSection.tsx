"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CopyButton } from "@/components/locapass-dashboard/CopyButton";
import { PasswordSetupModal } from "@/components/locapass-mypage/PasswordSetupModal";

/**
 * 店舗管理者が「自分のログインID」をいつでも確認し、パスワードを自分で変更できるようにする。
 * これまでは発行時に一度だけ表示される画面(IssuedLoginNotice)を閉じると、本人ですら
 * ログインIDを二度と確認できず、パスワードの自己変更手段も無かった
 * (ユーザー指摘: 「入れても永久に自分のIDパスがわからない」)。
 */
export function ShopAccountSettingsSection() {
  const [loginEmail, setLoginEmail] = useState<string | null>(null);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordSetupForced, setPasswordSetupForced] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    // locapass_my_shop_admin_login_email はDBには存在するが、生成済みのtypes/supabase.tsが
    // 巨大すぎて自動編集ツールがタイムアウトするため型定義への追記を見送っている。ここだけ型を緩める
    // (supabase自体をanyにcastして呼ぶ。.rpcだけ切り離すとthisが外れてクライアント内部が壊れるため注意)。
    (supabase as any).rpc("locapass_my_shop_admin_login_email").then(({ data }: { data: unknown }) => {
      if (typeof data === "string") setLoginEmail(data);
    });
    supabase.rpc("needs_password_setup").then(({ data }) => {
      if (data) {
        setPasswordSetupForced(true);
        setPasswordModalOpen(true);
      }
    });
  }, []);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-1 text-sm font-semibold text-slate-900">アカウント設定</h2>
      <p className="mb-3 text-xs text-slate-500">
        このダッシュボードへのログインID・パスワードです。発行時の画面を閉じた後も、ここでいつでも確認・変更できます。
      </p>
      <div className="flex max-w-sm items-center gap-2">
        <input
          readOnly
          value={loginEmail ?? "読み込み中..."}
          className="w-full rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900"
        />
        {loginEmail && <CopyButton value={loginEmail} />}
      </div>
      <button
        type="button"
        onClick={() => {
          setPasswordSetupForced(false);
          setPasswordModalOpen(true);
        }}
        className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
      >
        パスワードを変更する
      </button>
      <PasswordSetupModal
        open={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        forced={passwordSetupForced}
      />
    </section>
  );
}
