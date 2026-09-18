import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ShopStatusToggle } from "@/components/admin/ShopStatusToggle";
import { IssueShopLoginButton } from "@/components/admin/IssueShopLoginButton";
import { ResetShopPasswordButton } from "@/components/admin/ResetShopPasswordButton";
import { EnterShopDashboardButton } from "@/components/admin/EnterShopDashboardButton";
import { MapVideoOptionToggle } from "@/components/admin/MapVideoOptionToggle";

const PLAN_LABELS: Record<string, string> = {
  trial: "体験プラン",
  standard: "スタンダード",
  premium: "プレミアム",
  enterprise: "エンタープライズ",
};

export default async function AdminShopDetailPage({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = await params;
  const supabase = await createClient();

  const { data: shop } = await supabase
    .from("shops")
    .select("id, name, area, genre, plan, status, shop_code, address, phone, created_at, map_video_enabled")
    .eq("id", shopId)
    .single();

  if (!shop) notFound();

  const [{ data: staffRows }, { count: castCount }, { count: reelCount }] = await Promise.all([
    supabase
      .from("shop_staff")
      .select("id, role, login_email, created_at")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false }),
    supabase.from("cast_members").select("id", { count: "exact", head: true }).eq("shop_id", shopId),
    supabase.from("reels").select("id", { count: "exact", head: true }).eq("shop_id", shopId),
  ]);

  return (
    <div className="space-y-6">
      <Link href="/admin" className="text-sm text-slate-500 hover:text-slate-900">
        ← 店舗一覧に戻る
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-slate-900">{shop.name}</h1>
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              {PLAN_LABELS[shop.plan] ?? shop.plan}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {shop.area || "エリア未設定"} / {shop.genre || "ジャンル未設定"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            店舗コード: {shop.shop_code} / 作成日: {new Date(shop.created_at).toLocaleDateString("ja-JP")}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <span
              className={
                shop.status === "active"
                  ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                  : "rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700"
              }
            >
              {shop.status === "active" ? "公開中" : "非公開"}
            </span>
            <ShopStatusToggle shopId={shop.id} status={shop.status} />
          </div>
          <EnterShopDashboardButton shopId={shop.id} />
          <p className="text-[11px] text-slate-400">運営者自身のセッションで閲覧します(店舗のパスワードは変更されません)</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs text-slate-500">キャスト登録数</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{castCount ?? 0}名</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs text-slate-500">リール投稿数</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{reelCount ?? 0}件</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900">動画オプション</h2>
            <span
              className={
                shop.map_video_enabled
                  ? "rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700"
                  : "rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500"
              }
            >
              {shop.map_video_enabled ? "契約中" : "未契約"}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            契約中の店舗だけ、マップのカードで動画を再生します(店舗が選んだリール → 無ければ最新の動画リール)。
            未契約の店舗はトップ画像を表示します。プランとは別のオプションです。
          </p>
        </div>
        <MapVideoOptionToggle shopId={shop.id} enabled={shop.map_video_enabled} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900">ログインアカウント発行</h2>
        <p className="mt-1 text-xs text-slate-500">
          発行するたびに新しいアカウントが1件作られます。複数人に配布したい場合は必要な人数分発行してください。
        </p>
        <div className="mt-4">
          <IssueShopLoginButton shopId={shop.id} />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-200 p-6 text-sm font-bold text-slate-900">
          発行済みログイン一覧({staffRows?.length ?? 0}件)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-slate-500">
                <th className="px-6 py-3 font-medium">ログインID</th>
                <th className="px-6 py-3 font-medium">ロール</th>
                <th className="px-6 py-3 font-medium">発行日</th>
                <th className="px-6 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(staffRows ?? []).map((row) => (
                <tr key={row.id} className="align-top text-slate-700">
                  <td className="px-6 py-3 font-mono text-xs text-slate-600">
                    {row.login_email ?? "-"}
                  </td>
                  <td className="px-6 py-3">{row.role}</td>
                  <td className="px-6 py-3 text-slate-400">
                    {new Date(row.created_at).toLocaleString("ja-JP")}
                  </td>
                  <td className="px-6 py-3">
                    <ResetShopPasswordButton shopStaffId={row.id} />
                  </td>
                </tr>
              ))}
              {(staffRows ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-sm text-slate-400">
                    まだログインが発行されていません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
