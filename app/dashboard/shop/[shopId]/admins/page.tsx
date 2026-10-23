import { notFound } from "next/navigation";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import { createClient } from "@/lib/supabase/server";
import { LoginUrlCard } from "@/components/locapass-dashboard/LoginUrlCard";
import { AddShopAdminForm } from "@/components/locapass-dashboard/AddShopAdminForm";
import { addShopAdmin, removeShopAdmin } from "./actions";

const MAX_ADMINS = 5;

type AdminRow = { id: string; login_email: string; role: "owner" | "manager"; created_at: string; is_me: boolean };

/**
 * 管理者ID管理。この店舗の管理画面に入れるID(オーナー1+管理者)の一覧と、
 * オーナーIDだけができる「管理者の追加・削除」(1店舗5人まで)。
 */
export default async function LocapassShopAdminsPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const viewer = await getShopForManager(shopId);
  if (!viewer) notFound();
  const shop = viewer.shop;

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).rpc("locapass_list_shop_admins", { p_shop_id: shop.id });
  const admins: AdminRow[] = (data ?? []) as AdminRow[];
  const iAmOwner = admins.some((a) => a.is_me && a.role === "owner");
  const full = admins.length >= MAX_ADMINS;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">管理者ID</h1>
        <p className="mt-1 text-sm text-slate-600">
          この店舗の管理画面に入れるIDです(最大{MAX_ADMINS}人)。追加・削除ができるのは「オーナー」のIDだけです。管理者は、投稿やスタッフ管理など日々の運用ができ、IDの追加・削除はできません。
        </p>
      </div>

      <LoginUrlCard url="https://locapass.net/login" />

      {iAmOwner ? (
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            管理者IDを追加 <span className="font-normal text-slate-500">({admins.length}/{MAX_ADMINS}人)</span>
          </h2>
          {full && <p className="mb-3 text-sm text-amber-700">上限の{MAX_ADMINS}人に達しています。追加するには、使わない管理者を外してください。</p>}
          <AddShopAdminForm action={addShopAdmin.bind(null, shop.id)} disabled={full} loginUrl="https://locapass.net/login" />
        </section>
      ) : (
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          管理者IDの追加・削除は、オーナーのIDでログインしたときだけできます。
        </p>
      )}

      <section className="space-y-2">
        {admins.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="min-w-0">
              <p className="break-all text-sm font-semibold text-slate-900">
                {a.login_email}
                {a.is_me && <span className="ml-2 text-xs font-normal text-slate-400">(あなた)</span>}
              </p>
              <p className="text-xs text-slate-400">発行日: {new Date(a.created_at).toLocaleDateString("ja-JP")}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${a.role === "owner" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
                {a.role === "owner" ? "オーナー" : "管理者"}
              </span>
              {iAmOwner && a.role === "manager" && (
                <form action={removeShopAdmin.bind(null, shop.id, a.id)}>
                  <button type="submit" className="text-xs text-slate-400 hover:text-red-600">外す</button>
                </form>
              )}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
