"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Home, Search, User } from "lucide-react";
import { useActiveReelIndex } from "@/lib/reels/useActiveReelIndex";
import { useIsDesktop } from "@/lib/reels/useIsDesktop";
import { EventCard } from "@/components/EventCard";
import { EventGridCard } from "@/components/EventGridCard";
import type { PortalEvent } from "@/lib/types/shop";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { genreLabel } from "@/lib/i18n/genreLabels";

export function EventReel({
  events,
  genreChoices,
}: {
  events: PortalEvent[];
  genreChoices: string[];
}) {
  const { locale, t } = useLocale();
  const [activeGenres, setActiveGenres] = useState<string[]>([]);
  const isDesktop = useIsDesktop();

  const filtered = events.filter(
    (e) => !activeGenres.length || (e.genre && activeGenres.includes(e.genre)),
  );

  function toggleGenre(g: string) {
    setActiveGenres((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }

  const { activeIndex, registerItem } = useActiveReelIndex(isDesktop ? 0 : filtered.length);

  // デスクトップ幅: サイト通常のヘッダー/ナビを残したまま、カードグリッドで表示する
  // (フルスクリーン縦スナップは大画面だと1枚が巨大に伸びて破綻するため)。
  if (isDesktop) {
    return (
      <div className="space-y-4 pb-8 md:mx-auto md:max-w-[1400px] md:px-6 md:py-8">
        <div className="flex flex-wrap gap-2 px-1">
          {genreChoices.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => toggleGenre(g)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                activeGenres.includes(g)
                  ? "border-amber-400 bg-gradient-to-r from-amber-400 to-amber-500 text-zinc-950"
                  : "border-neutral-700 text-neutral-300"
              }`}
            >
              {genreLabel(locale, g)}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p className="px-2 py-16 text-center text-sm text-neutral-500">
            {t.feed.noEvents}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map((event) => (
              <EventGridCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] h-[100dvh] w-full bg-black">
      {/* トップバー: 戻る + 業種/エリア絞り込みピル(横スクロール) */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-2 px-3 pb-3 pt-[max(env(safe-area-inset-top),12px)]">
        <Link
          href="/"
          aria-label={t.common.close}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
        >
          <ArrowLeft size={16} />
        </Link>
        <div className="flex flex-1 gap-2 overflow-x-auto no-scrollbar">
          {genreChoices.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => toggleGenre(g)}
              className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs backdrop-blur-sm transition ${
                activeGenres.includes(g)
                  ? "border-amber-400 bg-gradient-to-r from-amber-400 to-amber-500 font-semibold text-zinc-950"
                  : "border-white/30 bg-black/40 text-white"
              }`}
            >
              {genreLabel(locale, g)}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex h-full w-full items-center justify-center px-8 text-center text-sm text-neutral-500">
          {t.feed.noEvents}
        </div>
      ) : (
        <div className="h-full w-full snap-y snap-mandatory overflow-y-scroll no-scrollbar">
          {filtered.map((event, i) => (
            <EventCard
              key={event.id}
              event={event}
              active={Math.abs(i - activeIndex) <= 1}
              containerRef={registerItem(i)}
            />
          ))}
        </div>
      )}

      {/* すりガラスボトムナビ */}
      <nav className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-around border-t border-white/10 bg-black/50 px-6 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur-xl">
        <Link href="/" className="p-2 text-white" aria-label={t.nav.home}>
          <Home size={22} />
        </Link>
        <button type="button" className="p-2 text-neutral-400" aria-label={t.nav.search}>
          <Search size={22} />
        </button>
        <Link href="/" className="p-2 text-neutral-400" aria-label={t.nav.mypage}>
          <User size={22} />
        </Link>
      </nav>
    </div>
  );
}
