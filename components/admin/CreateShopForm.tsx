"use client";

import { useActionState, useRef, useState, useEffect } from "react";
import { createShop, type CreateShopState } from "@/app/admin/(console)/actions";
import { SHOP_GENRES } from "@/lib/shop/genres";

const AREA_SUGGESTIONS = ["渋谷", "歌舞伎町", "六本木", "銀座", "池袋", "新宿"];

const PLAN_OPTIONS = [
  { value: "trial", label: "体験プラン" },
  { value: "standard", label: "スタンダード" },
  { value: "premium", label: "プレミアム" },
  { value: "enterprise", label: "エンタープライズ" },
];

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export function CreateShopForm() {
  const [state, formAction, pending] = useActionState<CreateShopState, FormData>(createShop, {
    status: "idle",
  });
  const formRef = useRef<HTMLFormElement>(null);
  const [passwordMode, setPasswordMode] = useState<"auto" | "manual">("auto");
  const [manualPassword, setManualPassword] = useState("");

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      setPasswordMode("auto");
      setManualPassword("");
    }
  }, [state]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-bold text-slate-900">新規店舗を発行</h2>
      <p className="mt-1 text-sm text-slate-500">
        発行すると Supabase Auth に管理者ログインが作成され、店舗管理画面(/login)にすぐログインできるようになります。
      </p>

      <form ref={formRef} action={formAction} className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="店舗名" required>
          <input
            name="name"
            required
            placeholder="例: プレミアムラウンジ渋谷"
            className="input"
          />
        </Field>

        <Field label="エリア">
          <input name="area" list="area-suggestions" placeholder="例: 渋谷" className="input" />
          <datalist id="area-suggestions">
            {AREA_SUGGESTIONS.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </Field>

        <Field label="ジャンル">
          <select name="genre" defaultValue="" className="input">
            <option value="">選択してください</option>
            {SHOP_GENRES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Field>

        <Field label="住所" className="sm:col-span-2">
          <input
            name="address"
            placeholder="例: 東京都渋谷区道玄坂1-2-3 〇〇ビル5F"
            className="input"
          />
          <p className="mt-1 text-[11px] text-slate-400">
            店舗詳細ページの地図・Googleマップ連携に使われます(未入力なら地図欄は非表示)。
          </p>
        </Field>

        <Field label="契約プラン">
          <select name="plan" defaultValue="standard" className="input">
            {PLAN_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="店舗管理者用メールアドレス" required className="sm:col-span-2">
          <input
            name="owner_email"
            type="email"
            required
            placeholder="owner@example.com"
            className="input"
          />
        </Field>

        <div className="sm:col-span-2">
          <span className="block text-xs font-medium text-slate-600">初期ログインパスワード</span>
          <div className="mt-1.5 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-1.5 text-sm text-slate-700">
              <input
                type="radio"
                name="password_mode"
                value="auto"
                checked={passwordMode === "auto"}
                onChange={() => setPasswordMode("auto")}
              />
              自動生成
            </label>
            <label className="flex items-center gap-1.5 text-sm text-slate-700">
              <input
                type="radio"
                name="password_mode"
                value="manual"
                checked={passwordMode === "manual"}
                onChange={() => setPasswordMode("manual")}
              />
              手動入力
            </label>
          </div>
          {passwordMode === "manual" && (
            <div className="mt-2 flex gap-2">
              <input
                name="owner_password"
                value={manualPassword}
                onChange={(e) => setManualPassword(e.target.value)}
                minLength={6}
                placeholder="6文字以上"
                className="input flex-1"
              />
              <button
                type="button"
                onClick={() => setManualPassword(generatePassword())}
                className="whitespace-nowrap rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                自動生成して入力
              </button>
            </div>
          )}
        </div>

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {pending ? "発行中..." : "店舗を発行する"}
          </button>
        </div>
      </form>

      {state.status === "error" && (
        <p className="mt-4 text-sm text-red-600">{state.message}</p>
      )}

      {state.status === "success" && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-semibold text-amber-900">
            店舗を発行しました。このログイン情報は今だけ表示されます。必ず店舗担当者に伝えてください。
          </p>
          <dl className="mt-3 space-y-2">
            <div>
              <dt className="text-xs text-amber-700/70">店舗管理ログインURL</dt>
              <dd className="select-all font-mono text-sm text-slate-900">
                https://luxela.jp/login
              </dd>
            </div>
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

      <style jsx>{`
        .input {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid rgb(203 213 225);
          background: white;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: rgb(15 23 42);
        }
        .input:focus {
          outline: none;
          border-color: rgb(99 102 241);
          box-shadow: 0 0 0 3px rgb(99 102 241 / 0.15);
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="text-xs font-medium text-slate-600">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
