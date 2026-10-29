"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, BookOpen, Camera, ChevronRight, CircleHelp, Settings, User, X, Zap } from "lucide-react";
import { SELECT_FEED_EVENT, type FeedKind } from "@/lib/reels/events";
import { useLocale } from "@/components/i18n/LocaleProvider";

type Props = {
  open: boolean;
  onClose: () => void;
  /** ホーム(子ポータル内ならそのポータルのトップ)。「見る」の選択は、ここのフィードに反映する。 */
  home: string;
  boostHref: string;
  accountHref: string;
  hasManagement: boolean;
};

const FEEDS: { kind: FeedKind; label: string }[] = [
  { kind: "shop", label: "SHOP" },
  { kind: "shop-reel", label: "SHOP REEL" },
  { kind: "faces-reel", label: "FACES REEL" },
];

/**
 * ボトムナビ右端のメニュー(☰)から出る、下からのシート。
 * 一番上に「見る」(フィードの切り替え。以前の2段階の選択を1タップにしたもの)を置き、
 * その下にサービス・アカウント・規約への入口をまとめる。入口が増えたら、ここに足す。
 */
export function MenuSheet({ open, onClose, home, boostHref, accountHref, hasManagement }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useLocale();
  // マウント直後は画面の下に置き、次のフレームで引き上げてスライドさせる。
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    const raf = requestAnimationFrame(() => setShown(true));
    const timer = window.setTimeout(() => setShown(true), 30);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // ページが切り替わったら閉じる(リンクを押したあと、シートが残らないように)。
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!open) return null;

  function pickFeed(kind: FeedKind) {
    if (pathname === home) {
      window.dispatchEvent(new CustomEvent(SELECT_FEED_EVENT, { detail: kind }));
    } else {
      router.push(`${home}?feed=${kind}`);
    }
    onClose();
  }

  const row =
    "flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-main transition hover:bg-main/5";
  const sectionTitle = "px-1 pb-2 text-[11px] tracking-[0.2em] text-tone-500";

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={t.nav.menu}>
      <button
        type="button"
        aria-label={t.common.close}
        onClick={onClose}
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 mx-auto max-h-[88vh] w-full max-w-md transform-gpu overflow-y-auto rounded-t-3xl border border-b-0 border-main/10 bg-surface p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl shadow-black/50 transition-transform duration-300 ease-out ${
          shown ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="font-display text-lg font-semibold tracking-[0.15em] text-accent">LOCAPASS</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-main/15 text-muted hover:text-main"
          >
            <X size={16} />
          </button>
        </div>

        <section className="mb-4">
          <p className={sectionTitle}>{t.nav.menuBrowse.toUpperCase()}</p>
          <div className="grid grid-cols-2 gap-2">
            {FEEDS.map((f) => (
              <button
                key={f.kind}
                type="button"
                onClick={() => pickFeed(f.kind)}
                className="rounded-2xl border border-main/15 bg-main/5 py-3.5 text-sm tracking-wide text-main transition hover:bg-main/10"
              >
                {f.label}
              </button>
            ))}
            <Link
              href="/photo"
              className="flex items-center justify-center gap-1.5 rounded-2xl border border-main/15 bg-main/5 py-3.5 text-sm tracking-wide text-main transition hover:bg-main/10"
            >
              <Camera size={15} />
              SNAP
            </Link>
          </div>
        </section>

        <section className="mb-4">
          <p className={sectionTitle}>掲載店・代理店募集</p>
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/lp/shop"
              className="flex items-center justify-center rounded-2xl border border-accent/50 bg-accent/10 px-3 py-3.5 text-center text-sm tracking-wide text-accent transition hover:bg-accent/20"
            >
              掲載店として参加
            </Link>
            <Link
              href="/lp/agency"
              className="flex items-center justify-center rounded-2xl border border-main/15 bg-main/5 px-3 py-3.5 text-center text-sm tracking-wide text-main transition hover:bg-main/10"
            >
              代理店として参加
            </Link>
          </div>
        </section>

        <section className="mb-4">
          <p className={sectionTitle}>{t.nav.menuServices.toUpperCase()}</p>
          <Link href={boostHref} className={`${row} font-bold text-amber-400`}>
            <Zap size={18} />
            BOOST
            <ChevronRight size={16} className="ml-auto text-tone-500" />
          </Link>
          <Link href="/journal" className={row}>
            <BookOpen size={18} className="text-tone-300" />
            Journal
            <ChevronRight size={16} className="ml-auto text-tone-500" />
          </Link>
          <Link href="/support" className={row}>
            <CircleHelp size={18} className="text-tone-300" />
            {t.nav.help}
            <ChevronRight size={16} className="ml-auto text-tone-500" />
          </Link>
          <Link href="/photo/new" className={row}>
            <Camera size={18} className="text-tone-300" />
            {t.nav.menuPost}
            <ChevronRight size={16} className="ml-auto text-tone-500" />
          </Link>
        </section>

        <section className="mb-4">
          <p className={sectionTitle}>{t.nav.menuAccount.toUpperCase()}</p>
          <Link href={accountHref} className={row}>
            <User size={18} className="text-tone-300" />
            {t.nav.mypage}
            <ChevronRight size={16} className="ml-auto text-tone-500" />
          </Link>
          <Link href="/notifications" className={row}>
            <Bell size={18} className="text-tone-300" />
            {t.nav.notifications}
            <ChevronRight size={16} className="ml-auto text-tone-500" />
          </Link>
          {hasManagement ? (
            <Link href="/dashboard/go?to=manage" className={row}>
              <Settings size={18} className="text-tone-300" />
              管理
              <ChevronRight size={16} className="ml-auto text-tone-500" />
            </Link>
          ) : null}
        </section>

        <nav className="flex justify-center gap-4 border-t border-main/10 pt-3 text-[11px] text-tone-500" aria-label="規約">
          <Link href="/terms" className="hover:text-main">
            利用規約
          </Link>
          <Link href="/privacy" className="hover:text-main">
            プライバシー
          </Link>
          <Link href="/legal" className="hover:text-main">
            特定商取引法
          </Link>
        </nav>
      </div>
    </div>
  );
}
