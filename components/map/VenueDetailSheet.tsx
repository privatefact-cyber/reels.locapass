"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "@/components/i18n/LocaleLink";
import { ChevronDown, ChevronRight, MapPin, Phone, Play } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { shopPath } from "@/lib/locapass/publicUrls";
import { useShopAi } from "@/components/shop/ShopAiChat";
import { ShopAiConcierge, ShopAiLauncher } from "@/components/shop/ShopAiConcierge";
import type { VenueCardData } from "@/types/venue";
import type { VenueSheetData, VenueSheetFace } from "@/app/api/venues/[shopId]/sheet/route";

/** シートの文言。ここだけで完結させる(辞書は触らない)。日本語以外は英語で出す。 */
const LABELS = {
  ja: {
    detail: "店舗詳細",
    open: "営業中",
    closed: "営業時間外",
    walk: (m: number) => (m < 2 ? "すぐ近く" : `徒歩約${m}分`),
    today: "本日のFACES",
    members: "FACES",
    photos: "みんなの写真",
    morePhotos: "もっと見る",
    from: "〜",
    reserve: "予約・問い合わせ",
    call: "電話する",
    route: "行き方を見る",
    close: "閉じる",
    loading: "読み込み中…",
    failed: "詳細を読み込めませんでした",
    working: "出勤",
  },
  en: {
    detail: "Venue page",
    open: "Open now",
    closed: "Closed",
    walk: (m: number) => (m < 2 ? "Right nearby" : `${m} min walk`),
    today: "Today's FACES",
    members: "FACES",
    photos: "Photos by visitors",
    morePhotos: "See more",
    from: "~",
    reserve: "Reserve / Contact",
    call: "Call",
    route: "Directions",
    close: "Close",
    loading: "Loading…",
    failed: "Couldn't load details",
    working: "Today",
  },
} as const;

function FaceRow({ title, casts, workingBadge }: { title: string; casts: VenueSheetFace[]; workingBadge: string | null }) {
  return (
    <section className="space-y-2">
      <h3 className="px-4 text-[11px] font-bold tracking-wide text-tone-400">{title}</h3>
      <div className="flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {casts.map((c) => (
          <Link key={c.id} href={c.href} className="w-16 shrink-0 text-center">
            <div className={`relative h-16 w-16 overflow-hidden rounded-full border-2 bg-tone-800 ${c.workingToday ? "border-emerald-400" : "border-main/10"}`}>
              {c.avatarUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.avatarUrl} alt={c.name} loading="lazy" className="h-full w-full object-cover" />
              )}
            </div>
            <p className="mt-1 truncate text-[11px] text-tone-300">{c.name}</p>
            {workingBadge && c.workingToday && <p className="text-[9px] font-bold text-emerald-400">{workingBadge}</p>}
          </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * マップのカードを広げたときに出す、店舗の詳細シート。
 * 上から: ヘッダー(店名・徒歩・営業中・店舗詳細へのリンク) → 本日の出勤 → 在籍キャスト(ギャラリー) → 料金の目安と予約ボタン。
 * 店舗詳細ページへの導線は、ヘッダーの店名・リンク・フッターの下に常に見えている。
 */
export function VenueDetailSheet({ venue, walkMinutes, onClose, onOpenReel }: { venue: VenueCardData; walkMinutes: number | null; onClose: () => void; onOpenReel: () => void }) {
  const { locale } = useLocale();
  const l = locale === "ja" ? LABELS.ja : LABELS.en;
  const [data, setData] = useState<VenueSheetData | null>(null);
  const [failed, setFailed] = useState(false);
  // 店舗AI質問(有料オプション)。オンの店舗だけ、バーを出す。タップすると、全画面のコンシェルジュが開く。
  const [aiOpen, setAiOpen] = useState(false);
  const ai = useShopAi(venue.id, { onLeave: () => setAiOpen(false) });
  // 開くとき、下からせり上がる(カードが広がる見え方)。
  const [shown, setShown] = useState(false);
  const [dragY, setDragY] = useState<number | null>(null);
  const dragStartY = useRef<number | null>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    let alive = true;
    setData(null);
    setFailed(false);
    fetch(`/api/venues/${venue.id}/sheet`)
      .then((r) => (r.ok ? (r.json() as Promise<VenueSheetData>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => alive && setData(d))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [venue.id]);

  // 背面のスクロールを止める。
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const today = data?.faces.filter((c) => c.workingToday) ?? [];
  const price = data?.minPrice;
  const reserve = data?.reserve ?? null;

  // 地図の親が作る重なり順の外(body直下)に出す。出さないと、画面下のナビがシートの上に被さる。
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end" onClick={onClose} role="dialog" aria-modal="true" aria-label={venue.name}>
      <div className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`} />
      {/* マップのカードが1段階広がった姿。上の写真はカードと同じ(タップでリール)。 */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={dragY ? { transform: `translateY(${Math.max(0, dragY)}px)` } : undefined}
        className={`relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-hl-400/70 bg-panel-950 shadow-2xl shadow-hl-500/20 sm:mx-auto sm:max-w-md ${dragY === null ? "transition-transform duration-300 ease-out" : ""} ${shown ? "translate-y-0" : "translate-y-full"}`}
      >
        {/* 写真(カードと同じ)+ 閉じる操作。下へスワイプでも閉じる。 */}
        <div
          className="relative h-44 w-full shrink-0 bg-surface"
          onTouchStart={(e) => {
            dragStartY.current = e.touches[0]?.clientY ?? null;
          }}
          onTouchMove={(e) => {
            const y = e.touches[0]?.clientY;
            if (y === undefined || dragStartY.current === null) return;
            setDragY(y - dragStartY.current);
          }}
          onTouchEnd={() => {
            const moved = dragY ?? 0;
            dragStartY.current = null;
            setDragY(null);
            if (moved > 70) onClose();
          }}
        >
          {venue.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={venue.imageUrl} alt={venue.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-tone-900 via-black to-tone-950">
              <span className="font-display text-sm uppercase tracking-[0.3em] text-accent/40">LUXELA</span>
            </div>
          )}
          {venue.reelCount > 0 && (
            <button
              type="button"
              onClick={onOpenReel}
              className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-bold tracking-wide text-main backdrop-blur"
            >
              <Play className="h-3 w-3 fill-main text-main" />
              REEL {venue.reelCount}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={l.close}
            className="absolute left-1/2 top-1.5 -translate-x-1/2 rounded-full bg-black/55 px-4 py-0.5 text-main backdrop-blur"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>

        {/* ヘッダー */}
        <div className="flex shrink-0 items-start gap-2 px-4 pb-3 pt-3">
          <Link href={shopPath(venue.portalSlug, venue.slug)} className="min-w-0 flex-1">
            <p className="truncate font-display text-base font-bold text-main">{venue.name}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
              {venue.area && <span>{venue.area}</span>}
              {walkMinutes !== null && <span className="text-hl-300/90">{l.walk(walkMinutes)}</span>}
              {data?.openNow !== null && data?.openNow !== undefined && (
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${data.openNow ? "bg-emerald-500/15 text-emerald-400" : "bg-main/10 text-tone-400"}`}>
                  {data.openNow ? l.open : l.closed}
                </span>
              )}
            </p>
          </Link>
          <Link href={shopPath(venue.portalSlug, venue.slug)} className="mt-0.5 inline-flex shrink-0 items-center text-xs font-semibold text-hl-300 hover:text-hl-200">
            {l.detail}
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        {/* メイン(キャスト写真) */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto border-t border-main/10 py-4">
          {!data && !failed && <p className="px-4 text-xs text-tone-500">{l.loading}</p>}
          {failed && <p className="px-4 text-xs text-tone-500">{l.failed}</p>}
          {today.length > 0 && <FaceRow title={`${l.today} (${today.length})`} casts={today} workingBadge={null} />}
          {data && data.faces.length > 0 && <FaceRow title={`${l.members} (${data.faces.length})`} casts={data.faces} workingBadge={l.working} />}
          {data && data.photos.length > 0 && (
            <section className="space-y-2">
              <h3 className="px-4 text-[11px] font-bold tracking-wide text-tone-400">{l.photos}</h3>
              <div className="flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {data.photos.map((p) => (
                  <Link key={p.id} href={data.photosHref} className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-tone-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.imageUrl} alt={p.caption ?? ""} loading="lazy" className="h-full w-full object-cover" />
                  </Link>
                ))}
                <Link href={data.photosHref} className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg border border-main/15 text-xs font-semibold text-hl-300">
                  {l.morePhotos} <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </section>
          )}
        </div>

        {/* 店舗AI質問(有料オプション。オンの店舗だけ)。その店の登録情報だけで答える。 */}
        {data?.aiChat && (
          <div className="shrink-0 border-t border-main/10 px-4 py-2">
            <ShopAiLauncher profile={data.aiAvatar ?? null} label={ai.labels.dockPlaceholder} onOpen={() => setAiOpen(true)} />
          </div>
        )}
        {aiOpen && <ShopAiConcierge ai={ai} shopName={venue.name} profile={data?.aiAvatar ?? null} onClose={() => setAiOpen(false)} />}

        {/* フッター(即決アクション) */}
        <div className="shrink-0 space-y-2 border-t border-main/10 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {price && (
            <p className="text-sm font-bold text-main">
              {price.minutes ? `${price.minutes}min ` : ""}¥{price.price.toLocaleString("ja-JP")}
              {l.from}
            </p>
          )}
          <div className="flex gap-2">
            {reserve ? (
              <a
                href={reserve.href}
                target={reserve.external ? "_blank" : undefined}
                rel="noopener noreferrer"
                className="flex-1 rounded-full bg-cta-light py-3 text-center text-sm font-bold tracking-wide text-on-cta-gold transition hover:bg-cta-hover"
              >
                {reserve.label ?? l.reserve}
              </a>
            ) : (
              <Link
                href={shopPath(venue.portalSlug, venue.slug)}
                className="flex-1 rounded-full bg-cta-light py-3 text-center text-sm font-bold tracking-wide text-on-cta-gold transition hover:bg-cta-hover"
              >
                {l.detail}
              </Link>
            )}
            {data?.phone && reserve && !reserve.href.startsWith("tel:") && (
              <a href={`tel:${data.phone}`} aria-label={l.call} className="inline-flex items-center justify-center rounded-full border border-main/15 px-4 text-tone-300 hover:border-hl-400/50 hover:text-hl-300">
                <Phone className="h-4 w-4" />
              </a>
            )}
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${venue.location.lat},${venue.location.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={l.route}
              className="inline-flex items-center justify-center rounded-full border border-main/15 px-4 text-tone-300 hover:border-hl-400/50 hover:text-hl-300"
            >
              <MapPin className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
