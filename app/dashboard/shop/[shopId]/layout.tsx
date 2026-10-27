import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import { DashboardSignOutButton } from "@/components/locapass-dashboard/DashboardSignOutButton";
import { RecoveryInfoGateModal } from "@/components/locapass-dashboard/RecoveryInfoGateModal";
import { PasswordSetupGate } from "@/components/locapass-dashboard/PasswordSetupGate";

/**
 * LUXELA本家の店舗ダッシュボード(app/dashboard/layout.tsx)と同じ画面構成。
 * 店舗本人(shop_admin)は自店舗だけを開ける。super_admin / portal_admin が開いたときは、
 * 本家の代理閲覧と同じバナーを出して管理コンソールへ戻れるようにする。
 */
const NAV_ITEMS = [
  { path: "", label: "店舗情報" },
  { path: "/cast", label: "FACES管理" },
  { path: "/staff", label: "スタッフ管理" },
  { path: "/admins", label: "管理者ID" },
  { path: "/account", label: "アカウント" },
  { path: "/me", label: "マイページ" },
  { path: "/reels", label: "リール投稿" },
  { path: "/photos", label: "写真の管理" },
  { path: "/boost", label: "⚡ブースト" },
  { path: "/reservations", label: "優先予約" },
  { path: "/messages", label: "お客様へのメッセージ" },
  { path: "/applicants", label: "応募者管理" },
  { path: "/inquiries", label: "お問い合わせ" },
];


export default async function LocapassShopDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = await params;
  const viewer = await getShopForManager(shopId);
  if (!viewer) notFound();
  const shop = viewer.shop;

  const basePath = `/dashboard/shop/${shop.id}`;

  // ポータルごとの機能(locapass_portals.features)。'items'のポータルだけ「在庫」メニューを出す。
  const supabase = (await createClient()) as any;
  const { data: portalRow } = await supabase.from("locapass_portals").select("features").eq("id", shop.portal_id).maybeSingle();
  const features: string[] = portalRow?.features ?? [];
  const navItems = features.includes("items") ? [NAV_ITEMS[0], { path: "/items", label: "在庫" }, ...NAV_ITEMS.slice(1)] : NAV_ITEMS;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {viewer.needsRecoverySetup && <RecoveryInfoGateModal />}
      {!viewer.isOperator && !viewer.needsRecoverySetup && <PasswordSetupGate />}
      {viewer.isOperator && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950 sm:px-6">
          <span>運営者として代理閲覧中: {shop.name}(店舗のパスワードは変更されていません)</span>
          <Link href="/admin" className="rounded-lg bg-amber-950/10 px-3 py-1 text-xs hover:bg-amber-950/20">
            終了して管理コンソールに戻る
          </Link>
        </div>
      )}
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1400px] items-center gap-1 px-4 py-2 sm:px-6">
          {/* メニューは横スクロール。右の「使い方」「ログアウト」は常に見える位置に固定する。 */}
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {navItems.map((item) => (
              <Link
                key={item.path}
                href={`${basePath}${item.path}`}
                className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-1 border-l border-slate-200 pl-2">
            <Link href={`${basePath}/support`} className="whitespace-nowrap rounded-lg bg-sky-50 px-3 py-2 text-sm font-bold text-sky-700 hover:bg-sky-100">
              ❓ 使い方
            </Link>
            <DashboardSignOutButton redirectTo={viewer.isOperator ? "/admin/login" : "/login"} />
          </div>
        </div>
      </nav>
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">{children}</div>
    </div>
  );
}