import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/require-admin";
import { getLocapassShopForDashboard } from "@/lib/locapass-dashboard/current-shop";
import { DashboardSignOutButton } from "@/components/locapass-dashboard/DashboardSignOutButton";

/**
 * LUXELA本家の店舗ダッシュボード(app/dashboard/layout.tsx)と同じ画面構成。
 * 本家では運営者が「店舗ダッシュボードに入る」と代理閲覧バナー付きでこの画面になるので、
 * 運営者/サイト管理者が開くこの画面でも同じバナーを常に出す。
 */
const NAV_ITEMS = [
  { path: "", label: "店舗情報" },
  { path: "/cast", label: "キャスト管理" },
  { path: "/staff", label: "スタッフ管理" },
  { path: "/reels", label: "リール投稿" },
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
  const scope = await requireAdmin();
  const shop = await getLocapassShopForDashboard(shopId, scope);
  if (!shop) notFound();

  const basePath = `/admin/locapass-shops/${shop.id}`;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950 sm:px-6">
        <span>運営者として代理閲覧中: {shop.name}(店舗のパスワードは変更されていません)</span>
        <Link href="/admin" className="rounded-lg bg-amber-950/10 px-3 py-1 text-xs hover:bg-amber-950/20">
          終了して管理コンソールに戻る
        </Link>
      </div>
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-1 overflow-x-auto px-4 py-2 sm:px-6">
          <div className="flex gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.path}
                href={`${basePath}${item.path}`}
                className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                {item.label}
              </Link>
            ))}
          </div>
          <DashboardSignOutButton />
        </div>
      </nav>
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">{children}</div>
    </div>
  );
}
