"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPortalShop, type CreateShopState } from "@/app/admin/(console)/portals/actions";
import { IssuedLoginNotice } from "./IssuedLoginNotice";
import { BUSINESS_TYPES, VERTICALS, type BusinessType } from "@/lib/verticals/registry";

const INPUT =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

/**
 * ポータル配下に店舗を発行する。発行時にその店舗の shop_admin(店舗オーナー・店長)の
 * ログインも同時に発行できる。portals が1件ならポータル選択は出さない。
 * 最初に業態(lib/verticals/registry.ts)を大きなカードから選ばせ、業種はそこから自動で決める
 * (この画面では業種を選ばせない。発行後に店舗情報で選び直せる)。
 */
export function CreatePortalShopForm({
  portals,
  defaultPortalId,
}: {
  portals: { id: number; name: string }[];
  defaultPortalId?: number;
}) {
  const [state, formAction, pending] = useActionState<CreateShopState, FormData>(createPortalShop, {
    status: "idle",
  });
  const formRef = useRef<HTMLFormElement>(null);
  const [issueLogin, setIssueLogin] = useState(true);
  const [businessType, setBusinessType] = useState<BusinessType | null>(null);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      setIssueLogin(true);
    }
  }, [state]);

  if (portals.length === 0) return null;
  const single = portals.length === 1 ? portals[0] : null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-bold text-slate-900">新規店舗を発行</h2>
      <p className="mt-1 text-sm text-slate-500">
        発行した店舗は「準備中」(非公開)で作成されます。店舗情報を整えてから公開してください。
      </p>

      {!businessType ? (
        <div className="mt-5">
          <p className="text-sm font-semibold text-slate-700">
            まず業態を選んでください <span className="text-red-500">*</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            業態によって、店舗管理画面に出る項目(ペット同伴可・駐車場などの属性)が変わります。発行後の変更は運営のみ行えます。
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {BUSINESS_TYPES.map((bt) => (
              <button
                key={bt}
                type="button"
                onClick={() => setBusinessType(bt)}
                className="flex min-h-[132px] flex-col items-start gap-2 rounded-xl border-2 border-slate-200 bg-white p-4 text-left transition hover:border-indigo-500 hover:bg-indigo-50/40 focus:border-indigo-500 focus:outline-none"
              >
                <span className="text-3xl leading-none" aria-hidden>
                  {VERTICALS[bt].icon}
                </span>
                <span className="text-base font-bold text-slate-900">{VERTICALS[bt].label.ja}</span>
                <span className="text-xs leading-snug text-slate-500">{VERTICALS[bt].description}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <form ref={formRef} action={formAction} className="mt-5 grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="business_type" value={businessType} />
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-100 bg-indigo-50/50 px-4 py-3 sm:col-span-2">
            <p className="text-sm text-slate-700">
              業態: <span className="font-bold text-slate-900">{VERTICALS[businessType].icon} {VERTICALS[businessType].label.ja}</span>
              <span className="ml-2 text-xs text-slate-500">業種は「{VERTICALS[businessType].category}」で発行します(発行後に店舗情報で変えられます)</span>
            </p>
            <button
              type="button"
              onClick={() => setBusinessType(null)}
              className="text-xs font-semibold text-indigo-600 hover:underline"
            >
              業態を選び直す
            </button>
          </div>
          {single ? (
            <input type="hidden" name="portal_id" value={single.id} />
          ) : (
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-slate-700">
                ポータル <span className="text-red-500">*</span>
              </span>
              <select name="portal_id" required defaultValue={defaultPortalId ?? ""} className={INPUT}>
                <option value="" disabled>
                  選択してください
                </option>
                {portals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              店舗名 <span className="text-red-500">*</span>
            </span>
            <input name="name" required placeholder="例: Cafe 麦（mugi）" className={INPUT} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">住所</span>
            <input name="address" placeholder="例: 茨城県水戸市..." className={INPUT} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">電話番号</span>
            <input name="tel" placeholder="例: 029-000-0000" className={INPUT} />
          </label>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                name="issue_login"
                checked={issueLogin}
                onChange={(e) => setIssueLogin(e.target.checked)}
              />
              店舗管理者(shop_admin)のログインも同時に発行する
            </label>
            {issueLogin && (
              <label className="mt-3 block">
                <span className="text-xs text-slate-500">
                  店舗管理者のメールアドレス(空欄なら店舗コードからログインIDを自動発行)
                </span>
                <input name="admin_email" type="email" placeholder="owner@example.com" className={INPUT} />
              </label>
            )}
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {pending ? "発行中..." : "店舗を発行する"}
            </button>
            {state.status === "error" && <p className="mt-2 text-sm text-red-600">{state.message}</p>}
            {state.status === "success" && (
              <div className="mt-2">
                <p className="text-sm text-emerald-700">
                  「{state.shopName}」を発行しました。
                  <Link href={`/dashboard/shop/${state.shopId}`} className="ml-1 font-semibold underline">
                    店舗情報を編集する →
                  </Link>
                </p>
                {state.login && (
                  <IssuedLoginNotice loginEmail={state.login.loginEmail} password={state.login.initialPassword} />
                )}
                {state.loginError && (
                  <p className="mt-2 text-sm text-red-600">
                    店舗は発行できましたが、ログインの発行に失敗しました: {state.loginError}
                  </p>
                )}
              </div>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
