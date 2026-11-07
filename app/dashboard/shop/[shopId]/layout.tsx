import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import { DashboardSignOutButton } from "@/components/locapass-dashboard/DashboardSignOutButton";
import { AdminLanguageSelect } from "@/components/locapass-dashboard/AdminLanguageSelect";
import { getAdminLocale } from "@/lib/i18n/getAdminLocale";
import { RecoveryInfoGateModal } from "@/components/locapass-dashboard/RecoveryInfoGateModal";
import { PasswordSetupGate } from "@/components/locapass-dashboard/PasswordSetupGate";
import { ShopNavMenu, type ShopNavGroup } from "@/components/locapass-dashboard/ShopNavMenu";

/**
 * LUXELA本家の店舗ダッシュボード(app/dashboard/layout.tsx)と同じ画面構成。
 * 店舗本人(shop_admin)は自店舗だけを開ける。super_admin / portal_admin が開いたときは、
 * 本家の代理閲覧と同じバナーを出して管理コンソールへ戻れるようにする。
 */
/** メニューの項目。モーダルでグループごとに出す(ShopNavMenu)。path は店舗管理画面の下のURL。 */
const NAV_GROUPS: { title: string; items: { path: string; label: string; icon: string; description: string }[] }[] = [
  {
    title: "お店",
    items: [{ path: "", label: "店舗情報", icon: "🏠", description: "店名・営業時間・写真など、掲載ページの基本情報" }],
  },
  {
    title: "人とアカウント",
    items: [
      { path: "/cast", label: "FACES管理", icon: "🌟", description: "お店の顔として投稿するメンバーの登録・管理" },
      { path: "/staff", label: "スタッフ管理", icon: "👥", description: "スタッフの登録とログイン用リンク" },
      { path: "/admins", label: "管理者ID", icon: "🔑", description: "この管理画面に入れるIDの追加・削除" },
      { path: "/account", label: "アカウント", icon: "⚙️", description: "ログインIDの確認とパスワードの変更" },
      { path: "/me", label: "マイページ", icon: "🙋", description: "ご自分のプロフィールと投稿" },
    ],
  },
  {
    title: "投稿",
    items: [
      { path: "/posts", label: "投稿", icon: "🎬", description: "リール・イベントの投稿と管理" },
      { path: "/photos", label: "写真の管理", icon: "🖼️", description: "お客様が投稿した写真の表示・非表示" },
    ],
  },
  {
    title: "集客と契約",
    items: [
      { path: "/boost", label: "ブースト", icon: "⚡", description: "時間限定のお得情報をすぐ掲載" },
      { path: "/contract", label: "掲載プランの契約", icon: "📄", description: "プランの選択とご契約" },
      { path: "/options", label: "オプション", icon: "🧩", description: "追加機能のオン・オフ" },
    ],
  },
  {
    title: "お客様対応",
    items: [
      { path: "/reservations", label: "優先予約", icon: "📅", description: "席の予約リクエストの確認" },
      { path: "/messages", label: "お客様へのメッセージ", icon: "💌", description: "お気に入り登録者へのお知らせ" },
      { path: "/applicants", label: "応募者管理", icon: "📝", description: "求人への応募の確認" },
      { path: "/inquiries", label: "お問い合わせ", icon: "✉️", description: "お客様からのお問い合わせ" },
      { path: "/google-reviews", label: "Googleの口コミ", icon: "⭐", description: "Googleの口コミの確認と返信" },
    ],
  },  // スマホでは上のバーに「使い方」を出さないので、メニューの中にも置く。
  {
    title: "ヘルプ",
    items: [{ path: "/support", label: "使い方", icon: "❓", description: "操作方法とサポートへの相談" }],
  },
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
  const adminLocale = await getAdminLocale();
  if (!viewer) notFound();
  const shop = viewer.shop;

  const basePath = `/dashboard/shop/${shop.id}`;

  // ポータルごとの機能(locapass_portals.features)。'items'のポータルだけ「在庫」メニューを出す。
  const supabase = (await createClient()) as any;
  const { data: portalRow } = await supabase.from("locapass_portals").select("features").eq("id", shop.portal_id).maybeSingle();
  const features: string[] = portalRow?.features ?? [];
  // 'mobile'(移動販売)のポータルは「今日の出店」、店舗オプション「開催場所のお知らせ」をオンにした店は「開催場所」を出す。
  const { data: optRow } = await supabase.from("locapass_shops").select("spot_notice_enabled, shop_code").eq("id", shop.id).maybeSingle();
  const spotNotice = Boolean(optRow?.spot_notice_enabled);
  const extraNav = [
    ...(features.includes("items") ? [{ path: "/items", label: "在庫", icon: "🚗", description: "在庫の登録・編集" }] : []),
    ...(features.includes("mobile")
      ? [{ path: "/today", label: "今日の出店", icon: "🚚", description: "今日の出店場所と時間" }]
      : spotNotice
        ? [{ path: "/today", label: "開催場所", icon: "📍", description: "開催場所のお知らせ" }]
        : []),
  ];
  const navGroups: ShopNavGroup[] = NAV_GROUPS.map((group, i) => ({
    title: group.title,
    items: [
      ...group.items.map((item) => ({ ...item, href: `${basePath}${item.path}` })),
      // 「お店」のグループに、業種ごとの項目と掲載ページへのリンクを足す。
      ...(i === 0
        ? [
            ...extraNav.map((item) => ({ ...item, href: `${basePath}${item.path}` })),
            ...(optRow?.shop_code
              ? [{ href: `/s/${optRow.shop_code}`, label: "掲載ページを見る", icon: "👀", description: "お客様に見えているページを別タブで開く", external: true }]
              : []),
          ]
        : []),
    ],
  }));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {viewer.needsRecoverySetup && <RecoveryInfoGateModal />}
      {!viewer.isOperator && !viewer.needsRecoverySetup && <PasswordSetupGate />}
      {/* 上に固定。PWAではステータスバーの下に潜り込むので、セーフエリア分の余白を足す(代理閲覧バナーの時は、バナー側で足す)。 */}
      <div className="sticky top-0 z-40">
      {viewer.isOperator && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-500 px-4 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] text-sm font-semibold text-amber-950 sm:px-6">
          <span>運営者として代理閲覧中: {shop.name}(店舗のパスワードは変更されていません)</span>
          <Link href="/admin" className="rounded-lg bg-amber-950/10 px-3 py-1 text-xs hover:bg-amber-950/20">
            終了して管理コンソールに戻る
          </Link>
        </div>
      )}
      <nav className={`border-b border-slate-200 bg-white ${viewer.isOperator ? "" : "pt-[env(safe-area-inset-top)]"}`}>
        <div className="mx-auto flex max-w-[1400px] items-center gap-2 px-4 py-2 sm:px-6">
          {/* メニューは「メニュー」ボタン1つにまとめ、押すとモーダルで全項目を出す。右の「ログアウト」は常に見える位置に置く(「使い方」はスマホではメニューの中)。 */}
          <div className="min-w-0 flex-1">
            <ShopNavMenu groups={navGroups} basePath={basePath} />
          </div>
          {optRow?.shop_code && (
            // 更新した内容を、管理画面から離れずに確かめられるよう、掲載ページは別タブで開く(スマホではメニューの中から開く)。
            <a
              href={`/s/${optRow.shop_code}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden whitespace-nowrap rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100 sm:block"
            >
              掲載ページを見る ↗
            </a>
          )}
          <div className="flex shrink-0 items-center gap-1 border-l border-slate-200 pl-2">
            <Link href={`${basePath}/support`} className="hidden whitespace-nowrap rounded-lg bg-sky-50 px-3 py-2 text-sm font-bold text-sky-700 hover:bg-sky-100 sm:block">
              ❓ 使い方
            </Link>
            <AdminLanguageSelect current={adminLocale} onLight />
            <DashboardSignOutButton redirectTo={viewer.isOperator ? "/admin/login" : "/login"} />
          </div>
        </div>
      </nav>
      </div>
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">{children}</div>
    </div>
  );
}