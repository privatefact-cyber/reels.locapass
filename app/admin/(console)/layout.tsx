import Link from "next/link";
import { requireAdmin } from "@/lib/admin/require-admin";
import { AdminSignOutButton } from "@/components/admin/AdminSignOutButton";
import { ShopNavMenu, type ShopNavGroup } from "@/components/locapass-dashboard/ShopNavMenu";

/**
 * 管理コンソールのメニュー。項目が増えて横並びでは折り返しだらけになったので、
 * 店舗管理画面と同じく「メニュー」ボタン1つにまとめ、押すとモーダルでグループごとに出す(ShopNavMenu)。
 */
const NAV_GROUPS: ShopNavGroup[] = [
  {
    title: "店舗とポータル",
    items: [
      { href: "/admin", label: "店舗一覧", icon: "🏪", description: "全ポータルの店舗の確認・管理" },
      { href: "/admin#portals", label: "ポータル発行・管理", icon: "🗺️", description: "ポータルの発行・名称変更・詳細管理" },
      { href: "/admin/google-business", label: "Google連携", icon: "📍", description: "Googleビジネスプロフィールとの同期" },
    ],
  },
  {
    title: "投稿と動画",
    items: [
      { href: "/admin/comments", label: "コメント管理", icon: "💬", description: "リールへのコメントの確認・削除" },
      { href: "/admin/pets", label: "迷子さがし", icon: "🐶", description: "ワンコ手帳の迷子のお知らせ・見つけました通報の確認・非表示" },
      { href: "/admin/ads", label: "広告投稿", icon: "📣", description: "リールフィードに混ぜる広告(PR)の投稿" },
      { href: "/admin/embeds", label: "外部動画", icon: "🎞️", description: "外部の動画をリールとして追加" },
      { href: "/admin/youtube-stock", label: "YouTube収集・動画ストック", icon: "📦", description: "YouTube Shortsの収集・判定・ステータス管理" },
    ],
  },
  {
    title: "お知らせとサポート",
    items: [
      { href: "/admin/messages", label: "お知らせ配信", icon: "📨", description: "全ユーザーへのお知らせ" },
      { href: "/admin/support", label: "サポート質問", icon: "❓", description: "サポートAIに寄せられた質問の確認" },
    ],
  },
  {
    title: "分析と契約",
    items: [
      { href: "/admin/analytics", label: "アクセス解析", icon: "📊", description: "閲覧数などのアクセス状況" },
      { href: "/admin/options", label: "オプション管理", icon: "🧩", description: "店舗ごとの有料オプションの設定" },
      { href: "/admin/billing", label: "掲載料・代理店", icon: "💴", description: "掲載料と代理店手数料の管理" },
    ],
  },
  {
    title: "アカウント",
    items: [
      { href: "/admin/account", label: "アカウント設定", icon: "⚙️", description: "ログイン情報の確認と変更" },
      { href: "/dashboard/go?to=personal", label: "マイページ（個人）へ", icon: "🙋", description: "個人としてのマイページを開く" },
    ],
  },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-2 sm:px-6">
          <Link href="/admin" className="hidden shrink-0 text-sm font-bold tracking-wide text-slate-900 md:block">
            LOCAPASS 管理コンソール
          </Link>
          <div className="min-w-0 flex-1">
            <ShopNavMenu groups={NAV_GROUPS} basePath="/admin" />
          </div>
          <Link
            href="/dashboard/go?to=personal"
            className="hidden shrink-0 rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-slate-500 hover:text-slate-900 sm:block"
          >
            マイページ（個人）へ
          </Link>
          <div className="flex shrink-0 items-center gap-3 border-l border-slate-200 pl-3">
            {user && <span className="hidden text-xs text-slate-400 lg:inline">{user.email}</span>}
            <AdminSignOutButton />
          </div>
        </div>
      </nav>
      <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}
