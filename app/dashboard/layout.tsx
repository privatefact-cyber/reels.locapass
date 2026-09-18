import Link from "next/link";
import { getActiveImpersonation } from "@/lib/dashboard/current-shop";
import { stopImpersonation } from "@/app/admin/(console)/actions";
import { DashboardSignOutButton } from "@/components/dashboard/DashboardSignOutButton";

const NAV_ITEMS = [
  { href: "/dashboard/shop", label: "店舗情報" },
  { href: "/dashboard/cast", label: "キャスト管理" },
  { href: "/dashboard/staff", label: "スタッフ管理" },
  { href: "/dashboard/reels", label: "リール投稿" },
  { href: "/dashboard/messages", label: "お客様へのメッセージ" },
  { href: "/dashboard/applicants", label: "応募者管理" },
  { href: "/dashboard/inquiries", label: "お問い合わせ" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const impersonation = await getActiveImpersonation();

  return (
    <div className="min-h-screen bg-slate-50">
      {impersonation && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950 sm:px-6">
          <span>運営者として代理閲覧中: {impersonation.shopName}(店舗のパスワードは変更されていません)</span>
          <form action={stopImpersonation}>
            <button type="submit" className="rounded-lg bg-amber-950/10 px-3 py-1 text-xs hover:bg-amber-950/20">
              終了して管理コンソールに戻る
            </button>
          </form>
        </div>
      )}
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-1 overflow-x-auto px-4 py-2 sm:px-6">
          <div className="flex gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
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
