"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { createPortal, type CreatePortalState } from "@/app/admin/(console)/portals/actions";
import { IssuedLoginNotice } from "./IssuedLoginNotice";

const INPUT =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

export function CreatePortalForm() {
  const [state, formAction, pending] = useActionState<CreatePortalState, FormData>(createPortal, { status: "idle" });
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-bold text-slate-900">新規ポータルを発行</h2>
      <p className="mt-1 text-sm text-slate-500">
        エリア単位の新しいポータルを作成し、指定したメールアドレスをポータル管理者(portal_admin)にします。
      </p>

      <form ref={formRef} action={formAction} className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            ポータル名(portal_name) <span className="text-red-500">*</span>
          </span>
          <input name="portal_name" required placeholder="例: つくばまちあるきポータル" className={INPUT} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            スラッグ(URL用) <span className="text-red-500">*</span>
          </span>
          <input
            name="slug"
            required
            pattern="[a-z0-9][a-z0-9\-]{1,40}"
            placeholder="例: tsukuba"
            className={INPUT}
          />
          <span className="mt-1 block text-[11px] text-slate-400">半角英小文字・数字・ハイフン(2〜41文字)。後から変更しない前提です。</span>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            ポータル管理者メール(admin_email) <span className="text-red-500">*</span>
          </span>
          <input name="admin_email" type="email" required placeholder="admin@example.com" className={INPUT} />
        </label>

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {pending ? "発行中..." : "ポータルを発行する"}
          </button>
          {state.status === "error" && <p className="mt-2 text-sm text-red-600">{state.message}</p>}
          {state.status === "success" && (
            <div className="mt-2 space-y-2">
              <p className="text-sm text-emerald-700">
                「{state.name}」を発行し、{state.adminEmail} に portal_admin 権限を付与しました。
                <Link href={`/admin/portals/${state.portalId}`} className="ml-1 font-semibold underline">
                  ポータルを管理する →
                </Link>
              </p>
              {state.initialPassword && <IssuedLoginNotice loginEmail={state.adminEmail} password={state.initialPassword} />}
              {state.adminError && (
                <p className="text-sm text-amber-700">
                  ポータルは作成されましたが、管理者権限の付与に失敗しました: {state.adminError}
                </p>
              )}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
