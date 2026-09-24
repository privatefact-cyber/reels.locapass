"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Share2 } from "lucide-react";
import type { PortalEvent } from "@/lib/types/shop";
import { formatEventDateRange } from "@/lib/events/formatEventDateRange";
import { useLocale } from "@/components/i18n/LocaleProvider";

/**
 * グリッドのイベントをタップしたときに開く拡大カード。見た目はReelCardと同じ(9:16・右にアクション・左下にCTA)で、
 * 縦スワイプで次のイベントへ流れる。店舗詳細へはCTAボタンからだけ遷移する(タップ即遷移しない)。
 */
export function EventExpandedCard({ event }: { event: PortalEvent }) {
  const { t } = useLocale();
  const [shareCopied, setShareCopied] = useState(false);
  const shopUrl = `/shops/${event.shopId}`;
  const dates = formatEventDateRange(event);

  useEffect(() => {
    if (!shareCopied) return;
    const timer = window.setTimeout(() => setShareCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [shareCopied]);

  async function handleShare() {
    const url = new URL(shopUrl, window.location.origin).toString();
    if (navigator.share) {
      try {
        await navigator.share({ title: `LUXELA | ${event.title}`, url });
      } catch {
        // noop
      }
      return;
    }
    try {
      await navigator.clipboard?.writeText(url);
      setShareCopied(true);
    } catch {
      // noop
    }
  }

  return (
    <div className="relative aspect-[9/16] w-full transform-gpu will-change-transform md:h-full md:w-auto">
      <div className="absolute inset-0 overflow-hidden rounded-2xl bg-neutral-950">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={event.imageUrl} alt={event.title} loading="lazy" className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/30" />
        <div className="absolute inset-x-3 top-3 flex flex-wrap gap-2">
          {event.area && (
            <span className="rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
              📍 {event.area}
            </span>
          )}
          {event.genre && (
            <span className="rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
              🍸 {event.genre}
            </span>
          )}
        </div>
      </div>

      <div className="pointer-events-auto absolute bottom-24 right-3 flex flex-col items-center gap-5 text-white md:bottom-28 md:right-[-64px]">
        <button type="button" onClick={handleShare} className="relative flex flex-col items-center gap-1">
          <Share2 size={24} />
          <span className="text-[11px] drop-shadow">{t.common.share}</span>
          {shareCopied && (
            <span className="pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap rounded-full bg-black/80 px-3 py-1 text-xs text-white shadow-lg">
              {t.common.linkCopied}
            </span>
          )}
        </button>
      </div>

      <div className="pointer-events-auto absolute bottom-4 left-3 right-16 space-y-2">
        <h2 className="font-display text-xl font-bold leading-tight tracking-wide text-white drop-shadow-lg">
          {event.title}
        </h2>
        <Link
          href={shopUrl}
          className="inline-flex items-center gap-1 rounded-full border border-white/30 bg-white/15 px-4 py-2 text-sm font-medium text-white backdrop-blur-md"
        >
          {t.common.learnMore} <span aria-hidden>▷</span>
        </Link>
        <Link href={shopUrl} className="block w-fit text-white drop-shadow">
          <p className="text-sm font-semibold">{event.shopName}</p>
          {dates && <p className="text-xs text-white/80">{dates}</p>}
        </Link>
      </div>
    </div>
  );
}
