import { Clock, MapPin, Navigation } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locale";

export type ShopSpot = { kind: "live" | "next"; address: string | null; lat: number; lng: number; startsAt: string; endsAt: string };

const INTL_TAG: Record<Locale, string> = { ja: "ja-JP", en: "en-US", zh: "zh-CN", ar: "ar-u-nu-latn" };

function formatRange(startsAt: string, endsAt: string, locale: Locale): string {
  const tag = INTL_TAG[locale];
  const fmt = (iso: string, withDate: boolean) =>
    new Date(iso).toLocaleString(tag, { timeZone: "Asia/Tokyo", ...(withDate ? { month: "numeric", day: "numeric", weekday: "short" } : {}), hour: "2-digit", minute: "2-digit", hour12: false });
  const sameDay = new Date(startsAt).toDateString() === new Date(endsAt).toDateString();
  return `${fmt(startsAt, true)} 〜 ${fmt(endsAt, !sameDay)}`;
}

/**
 * 移動販売など、出店場所(位置つきのイベント)を持つ店だけに出すカード。いま営業中なら「いま営業中」、まだなら「次の出店」。
 * 他の項目と同じ見た目(情報カード)で、出店場所・時間・ルート案内だけを出す。
 */
export function ShopSpotCard({ spot, t, locale }: { spot: ShopSpot; t: Dictionary["shop"]; locale: Locale }) {
  const live = spot.kind === "live";
  const routeUrl = `https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`;
  return (
    <section aria-label={t.spotAria} className="space-y-3 rounded-2xl border border-line/20 bg-panel-900/60 p-5 shadow-2xl backdrop-blur-xl">
      <p className="flex items-center gap-2 text-[11px] tracking-[0.3em] text-hl-400/80">
        {live ? <span className="h-2 w-2 animate-pulse rounded-full bg-hl-400" /> : <MapPin size={13} />}
        {live ? t.spotLive : t.spotNext}
      </p>
      {spot.address && <p className="text-base font-semibold leading-snug text-tone-100">{spot.address}</p>}
      <p className="flex items-start gap-2 text-sm text-tone-300">
        <Clock size={15} className="mt-0.5 shrink-0 text-hl-400/80" />
        {formatRange(spot.startsAt, spot.endsAt, locale)}
      </p>
      <a
        href={routeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-cta-light to-cta-deep px-4 py-2.5 text-sm font-bold text-on-cta-gold shadow-lg transition hover:brightness-110"
      >
        <Navigation size={16} />
        {t.routeGuide}
      </a>
    </section>
  );
}
