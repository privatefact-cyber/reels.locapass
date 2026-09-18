"use client";

import { useActionState } from "react";
import { updateLocapassShop, type UpdateShopState } from "@/app/admin/(console)/locapass-shops/[shopId]/actions";

type ShopFields = {
  id: string;
  name: string;
  category: string | null;
  tagline: string | null;
  description: string | null;
  address: string | null;
  tel: string | null;
  business_hours: string | null;
  url: string | null;
  line_url: string | null;
  cover_url: string | null;
  icon_url: string | null;
};

export function LocapassShopEditForm({ shop }: { shop: ShopFields }) {
  const boundAction = updateLocapassShop.bind(null, shop.id);
  const [state, formAction, pending] = useActionState<UpdateShopState, FormData>(boundAction, { status: "idle" });

  return (
    <form action={formAction} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="店舗名 *" name="name" defaultValue={shop.name} required />
        <Field label="ジャンル" name="category" defaultValue={shop.category ?? ""} />
        <Field label="キャッチコピー" name="tagline" defaultValue={shop.tagline ?? ""} />
        <Field label="電話番号" name="tel" defaultValue={shop.tel ?? ""} />
        <Field label="住所" name="address" defaultValue={shop.address ?? ""} />
        <Field label="営業時間" name="business_hours" defaultValue={shop.business_hours ?? ""} />
        <Field label="公式サイトURL" name="url" defaultValue={shop.url ?? ""} />
        <Field label="LINE URL" name="line_url" defaultValue={shop.line_url ?? ""} />
        <Field label="カバー画像URL" name="cover_url" defaultValue={shop.cover_url ?? ""} />
        <Field label="アイコン画像URL" name="icon_url" defaultValue={shop.icon_url ?? ""} />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">紹介文</label>
        <textarea
          name="description"
          defaultValue={shop.description ?? ""}
          rows={4}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      {state.status === "error" && <p className="text-sm text-red-600">{state.message}</p>}
      {state.status === "success" && <p className="text-sm text-emerald-600">保存しました</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "保存中..." : "保存する"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  defaultValue: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      <input
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
      />
    </div>
  );
}
