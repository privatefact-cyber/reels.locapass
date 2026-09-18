import Link from "next/link";
import { requireAdmin } from "@/lib/admin/require-admin";
import { AdminSignOutButton } from "@/components/admin/AdminSignOutButton";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="text-sm font-bold tracking-wide text-slate-900">
              LOCAPASS 管理コンソール
            </Link>
            <Link
              href="/admin"
              className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
            >
              店舗一覧
            </Link>
            <Link
              href="/admin/sites"
              className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
            >
              サイト管理
            </Link>
            <Link
              href="/admin/comments"
              className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
            >
              コメント管理
            </Link>
            <Link
              href="/admin/messages"
              className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
            >
              お知らせ配信
            </Link>
            <Link
              href="/admin/ads"
              className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
            >
              広告投稿
            </Link>
            <Link
              href="/admin/account"
              className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
            >
              アカウント設定
            </Link>
          </div>
          <div className="flex items-center gap-4">
            {user && <span className="hidden text-xs text-slate-400 sm:inline">{user.email}</span>}
            <AdminSignOutButton />
          </div>
        </div>
      </nav>
      <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}
