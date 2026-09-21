"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Map as MapIcon, PartyPopper, User } from "lucide-react";
import { MenuButton } from "@/components/MenuButton";
import { SearchButton } from "@/components/SearchButton";
import { NowButton } from "@/components/NowButton";
import { AiInquiryWidget } from "@/components/AiInquiryWidget";
import { NotificationBell } from "@/components/NotificationBell";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { siteConfig } from "@/config/site";

type Props = {
  myPageAvatarUrl: string | null;
  myPageInitial: string | null;
};

// マップページ(/tokyo/[city]/map)はUber風の没入型UIにするため、上部ヘッダーは出さない。
// ボトムナビはマップ自体がナビの行き先なので残す(消すと地図から他タブへ戻れなくなる)。
// AIコンシェルジュはマップでも使えるようにし、カードと重ならない位置(placement="map")に置く。
// 言語切替はヘッダーの代わりにマップ上部のバー(VenueMapExplorer)に置いている。
// components/AppShell.tsxの full-bleed 判定と同じパターン。
const FULL_BLEED_PATTERN = /^\/map$\vert{}^\/[^/]+\/[^/]+\/map$/;

// 公開ローンチ前の合言葉ゲート(/gate)では、ヘッダー・ボトムナビ・AI問い合わせウィジェットを
// 一切表示しない(合言葉を通していない訪問者にサイトの中身・機能を一切見せないため)。
// 管理画面(/admin)・店舗ダッシュボード(/dashboard)・キャスト/スタッフ用ログインも、
// 一般客向けのゴールド調ヘッダー/ボトムナビ/AIコンシェルジュを出す対象ではない
// (スタッフ・運営者しか来ない画面に客向けチャットが浮いて出てしまっていたため除外する)。
// 一般会員向けの/login・/mypage/loginはAIコンシェルジュを含め通常どおり表示する。
const EXCLUDED_PREFIXES = ["/gate", "/admin", "/dashboard", "/cast/login", "/staff/login"];

// スタッフ/キャスト本人の画面は、本家(旧 /staff/mypage・/cast/mypage)と同じく通常のヘッダー付きで表示する。
const CHROME_INCLUDED_PREFIXES = ["/dashboard/staff", "/dashboard/cast"];

function isExcludedPath(pathname: string): boolean {
  const matches = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);
  if (CHROME_INCLUDED_PREFIXES.some(matches)) return false;
  return EXCLUDED_PREFIXES.some(matches);
}

export function SiteChrome({ myPageAvatarUrl, myPageInitial }: Props) {
  const pathname = usePathname();
  const { t } = useLocale();
  if (isExcludedPath(pathname ?? "")) return null;
  const mapImmersive = FULL_BLEED_PATTERN.test(pathname ?? "");

  return (
    <>
      {/* 高級感のあるゴールド調ヘッダー(すりガラス+光暈の装飾背景) */}
      {!mapImmersive && (
      <header className="sticky top-0 z-50 overflow-hidden border-b border-white/10 backdrop-blur-xl backdrop-saturate-150 shadow-lg shadow-black/30" style={{ backgroundColor: "var(--portal-header-background, rgba(0, 0, 0, .6))" }}>
        {/* 背景の光暈(装飾、クリック不可) */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[140%] -translate-x-1/2 rounded-full blur-3xl"
          style={{ background: "radial-gradient(ellipse at center, var(--portal-header-glow, rgba(168, 85, 247, .25)), transparent 68%)" }}
        />

        {/* お知らせバー */}
        <div className="relative border-b border-white/5 px-4 py-1.5 text-center text-[11px] text-neutral-300">
          繋がる広がるリールメディアLOCAPASS【ロカパス】
        </div>

        {/* メインヘッダー行(PC幅ではワイドに広がる) */}
        <div className="relative mx-auto flex max-w-md items-center justify-between gap-2 px-4 py-3 sm:max-w-none md:max-w-[1400px] md:px-6">
          <nav className="hidden items-center gap-6 text-sm font-medium text-neutral-300 md:flex">
            <Link href="/" className="transition hover:text-gold">
              {t.nav.home}
            </Link>
            <Link href="/events" className="transition hover:text-gold">
              {t.nav.events}
            </Link>
            {/* ボトムナビはmd:hiddenなので、PCではここがマップへの唯一の導線になる。 */}
            <Link href="/map" className="inline-flex items-center gap-1.5 transition hover:text-gold">
              <MapIcon size={16} />
              {t.nav.map}
            </Link>
          </nav>
          <div className="w-8 md:hidden" />
          <Link
            href="/"
            className="font-display text-2xl font-semibold uppercase tracking-[0.2em] text-gold"
          >
            {siteConfig.name}
          </Link>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <NotificationBell />
            <Link
              href="/mypage"
              aria-label={t.nav.mypage}
              className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-gold/60 bg-gradient-to-tr from-gold-dark via-gold to-gold-light text-black"
            >
              {myPageAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={myPageAvatarUrl} alt="" className="h-full w-full object-cover" />
              ) : myPageInitial ? (
                <span className="text-xs font-bold">{myPageInitial}</span>
              ) : (
                <User size={16} />
              )}
            </Link>
            <div className="hidden md:block">
              <MenuButton />
            </div>
          </div>
        </div>
      </header>
      )}

      {/* 固定ボトムナビゲーション(モバイルのみ。セーフエリア対応) */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 transform-gpu border-t border-white/10 bg-white/5 backdrop-blur-xl backdrop-saturate-150 shadow-lg shadow-black/20 pb-[env(safe-area-inset-bottom)] pt-2 px-3 flex items-center justify-between max-w-md mx-auto sm:max-w-none sm:px-6 md:hidden">
        <Link href="/" className="flex flex-col items-center gap-0.5 p-2 text-white" aria-label={t.nav.home}>
          <Home size={22} />
          <span className="text-[10px] leading-none">{t.nav.home}</span>
        </Link>
        <NowButton />
        <Link
          href="/events"
          className="flex flex-col items-center gap-0.5 p-2 text-gold"
          aria-label={t.nav.events}
        >
          <PartyPopper size={22} />
          <span className="text-[10px] leading-none">{t.nav.events}</span>
        </Link>
        <Link
          href="/map"
          className="flex flex-col items-center gap-0.5 p-2 text-neutral-400 hover:text-white"
          aria-label={t.nav.map}
        >
          <MapIcon size={22} />
          <span className="text-[10px] leading-none">{t.nav.map}</span>
        </Link>
        <SearchButton />
        <MenuButton />
      </nav>

      <AiInquiryWidget placement={mapImmersive ? "map" : "floating"} />
    </>
  );
}
