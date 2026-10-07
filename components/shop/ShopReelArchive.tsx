"use client";

import { memo, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { CalendarSearch, ChevronLeft, ChevronRight, Film, LayoutGrid, CalendarDays, Play, X } from "lucide-react";
import { PageDots } from "@/components/shop/PageDots";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { tagLabel } from "@/lib/reels/tags/vocabulary";
import { recordReelEvent } from "@/lib/reels/trackReelEvent";

export type ArchiveItem = {
  id: string;
  /** 投稿日時(ISO)。表示・グルーピングはすべて日本時間(JST)基準。 */
  at: string;
  thumbUrl: string | null;
  /** サムネが無いときだけ入る動画URL(先頭フレームを代用する)。 */
  videoUrl: string | null;
  isVideo: boolean;
  author: string;
  /** AIが付けたタグのID(辞書: lib/reels/tags/vocabulary.ts)。未処理なら空。 */
  tags: string[];
};

const JST = "Asia/Tokyo";
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: JST, year: "numeric", month: "2-digit", day: "2-digit" });

/** "YYYY-MM-DD"(JST)。 */
function dayKey(iso: string): string {
  return dayFmt.format(new Date(iso));
}

function intlLocale(locale: string): string {
  return locale === "zh" ? "zh-CN" : locale;
}

const Thumb = memo(function Thumb({ item, className = "" }: { item: ArchiveItem; className?: string }) {
  if (item.thumbUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.thumbUrl} alt="" loading="lazy" className={`h-full w-full object-cover ${className}`} />;
  }
  if (item.videoUrl) {
    return (
      <video
        src={`${item.videoUrl}#t=0.001`}
        muted
        playsInline
        preload="metadata"
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-tone-800 via-tone-950 to-black">
      <span className="font-display text-[10px] uppercase tracking-[0.2em] text-accent/50">LOCAPASS</span>
    </div>
  );
});

// トップページのグリッドと同じ列構成(スマホ3列、タブレット縦6列、横4〜8列)。
const GRID_CLASS =
  "grid grid-cols-3 gap-[1px] sm:landscape:grid-cols-4 sm:portrait:grid-cols-6 md:landscape:grid-cols-6 md:gap-[2px] lg:landscape:grid-cols-8";

function Tile({ item, href, dateLabel }: { item: ArchiveItem; href: string; dateLabel: string }) {
  return (
    <Link
      data-surface="media"
      href={`${href}?start=${item.id}`}
      className="group relative block aspect-square w-full overflow-hidden bg-panel-900"
    >
      <Thumb item={item} className="transform-gpu transition duration-300 group-hover:scale-105 group-hover:brightness-110" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/5 to-transparent" />
      {item.isVideo && (
        <span className="pointer-events-none absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm">
          <Play size={10} className="fill-main text-main" />
        </span>
      )}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 px-2 pb-1.5 pt-4">
        <span className="block text-[11px] font-semibold tabular-nums text-main drop-shadow">{dateLabel}</span>
        <span dir="auto" className="block truncate text-[10px] text-main/70">
          {item.author}
        </span>
      </span>
    </Link>
  );
}

export function ShopReelArchive({
  items,
  shopName,
  shopHref,
  reelsHref,
  archiveHref,
  trackShopId,
  trackCastId,
}: {
  items: ArchiveItem[];
  shopName: string;
  shopHref: string;
  reelsHref: string;
  archiveHref: string;
  /** タグ検索の記録先(投稿者向けインサイト用)。店舗ページなら店舗、個人ページならキャスト。 */
  trackShopId?: string;
  trackCastId?: string;
}) {
  const { locale, t } = useLocale();
  const loc = intlLocale(locale);
  const [view, setView] = useState<"timeline" | "calendar">("timeline");
  const [author, setAuthor] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const monthFmt = useMemo(
    () => new Intl.DateTimeFormat(loc, { timeZone: JST, year: "numeric", month: "long" }),
    [loc],
  );
  const shortDayFmt = useMemo(
    () => new Intl.DateTimeFormat(loc, { timeZone: JST, month: "numeric", day: "numeric" }),
    [loc],
  );
  const monthLabel = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    return monthFmt.format(new Date(Date.UTC(y, m - 1, 15)));
  };

  const authors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of items) counts.set(it.author, (counts.get(it.author) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [items]);

  const byAuthor = useMemo(() => (author ? items.filter((i) => i.author === author) : items), [items, author]);

  // 絞り込みチップ: 実際に付いているタグだけを、多い順に出す(件数は投稿者で絞った範囲で数える)。
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of byAuthor) for (const id of it.tags) counts.set(id, (counts.get(id) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [byAuthor]);

  const filtered = useMemo(() => (tag ? byAuthor.filter((i) => i.tags.includes(tag)) : byAuthor), [byAuthor, tag]);

  const { months, byMonth, byDay } = useMemo(() => {
    const byMonth = new Map<string, ArchiveItem[]>();
    const byDay = new Map<string, ArchiveItem[]>();
    for (const it of filtered) {
      const d = dayKey(it.at);
      const m = d.slice(0, 7);
      (byMonth.get(m) ?? byMonth.set(m, []).get(m)!).push(it);
      (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(it);
    }
    return { months: [...byMonth.keys()].sort().reverse(), byMonth, byDay };
  }, [filtered]);

  // 月ジャンプ用: 年ごとにまとめる(新しい年が上)。
  const monthsByYear = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const m of months) {
      const y = m.slice(0, 4);
      (map.get(y) ?? map.set(y, []).get(y)!).push(m);
    }
    return [...map.entries()];
  }, [months]);

  const [cursor, setCursor] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const activeCursor = cursor && months.includes(cursor) ? cursor : (months[0] ?? null);

  const jumpToMonth = (m: string) => {
    setSheetOpen(false);
    if (view === "calendar") {
      setCursor(m);
      setSelectedDay(null);
    } else {
      // シートのクローズ(スクロールロック解除)後に動かす。
      requestAnimationFrame(() => document.getElementById(`m-${m}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  // シート表示中は背面のスクロールを止める。
  useEffect(() => {
    if (!sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheetOpen]);

  return (
    <div className="px-1 pt-3 sm:px-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between gap-3 px-3 pb-4">
        <Link href={shopHref} className="flex min-w-0 items-center gap-1 text-sm text-hl-300 hover:underline">
          <ChevronLeft size={16} className="shrink-0 rtl:rotate-180" />
          <span dir="auto" className="truncate">
            {shopName}
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label={t.shop.archiveSearch}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cta-light to-cta text-on-cta shadow-[0_0_18px_rgb(var(--cta-500)/0.45)] ring-1 ring-main/20 transition active:scale-95"
        >
          <CalendarSearch size={20} />
        </button>
      </div>

      <PageDots current={1} shopHref={shopHref} archiveHref={archiveHref} />

      <div className="px-3 text-center">
        <p className="flex items-center justify-center gap-2 text-[11px] tracking-[0.3em] text-hl-400/60">
          <Film size={13} />
          ── ARCHIVE ──
        </p>
        <h1 className="font-display mt-1 bg-gradient-to-r from-hl-200 via-hl-400 to-hl-200 bg-clip-text text-2xl font-bold text-transparent">
          {t.shop.archiveTitle}
        </h1>
        <p className="mt-1 text-xs text-muted">
          {t.shop.archiveCount(filtered.length)}
          {author && <span dir="auto"> ・ {author}</span>}
          {tag && <span> ・ {tagLabel(locale, tag)}</span>}
        </p>
      </div>

      {/* 表示切り替え */}
      <div className="mx-auto mt-4 flex w-fit items-center gap-1 rounded-full border border-line/30 bg-panel-950/70 p-1 backdrop-blur-xl">
        {(
          [
            ["timeline", t.shop.archiveTimeline, LayoutGrid],
            ["calendar", t.shop.archiveCalendar, CalendarDays],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={
              view === id
                ? "flex items-center gap-1.5 rounded-full bg-gradient-to-r from-cta-light to-cta px-4 py-1.5 text-xs font-bold text-on-cta shadow-[0_0_12px_rgb(var(--cta-500)/0.4)]"
                : "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs text-panel-400 transition hover:text-hl-300"
            }
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* タグ絞り込み(AIが投稿時に付けた「料理」「店内」など)。付いているタグがある店舗だけ出る。 */}
      {(tagCounts.length > 0 || tag) && (
        <div className="no-scrollbar -mx-1 mt-4 flex gap-2 overflow-x-auto px-4 pb-1" data-no-swipe>
          {[null, ...tagCounts.map(([id]) => id), ...(tag && !tagCounts.some(([id]) => id === tag) ? [tag] : [])].map((id) => (
            <button
              key={id ?? "__all"}
              type="button"
              onClick={() => {
                setTag(id);
                setSelectedDay(null);
                if (id) recordReelEvent("tag_search", { shopId: trackCastId ? undefined : trackShopId, castId: trackCastId, tag: id });
              }}
              className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs transition active:scale-95 ${
                tag === id
                  ? "bg-gradient-to-r from-cta-light to-cta font-bold text-on-cta shadow-[0_0_12px_rgb(var(--cta-500)/0.35)]"
                  : "border border-line/30 text-tone-300 hover:text-hl-300"
              }`}
            >
              {id ? `#${tagLabel(locale, id)}` : t.shop.archiveAll}
              {id && <span className="text-[10px] opacity-60">{tagCounts.find(([x]) => x === id)?.[1] ?? 0}</span>}
            </button>
          ))}
        </div>
      )}

      <div className="mt-5">
        {filtered.length === 0 ? (
          <p className="px-2 py-16 text-center text-sm text-tone-500">{t.shop.archiveEmpty}</p>
        ) : view === "timeline" ? (
          <div className="space-y-6">
            {months.map((m) => (
              <section key={m} id={`m-${m}`} className="scroll-mt-20">
                <div className="flex items-baseline justify-between px-3 pb-2">
                  <h2 className="font-display text-base font-semibold text-hl-300">{monthLabel(m)}</h2>
                  <span className="text-[11px] text-tone-500">{t.shop.archiveCount(byMonth.get(m)!.length)}</span>
                </div>
                <div className={GRID_CLASS}>
                  {byMonth.get(m)!.map((it) => (
                    <Tile key={it.id} item={it} href={reelsHref} dateLabel={shortDayFmt.format(new Date(it.at))} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          activeCursor && (
            <CalendarView
              cursor={activeCursor}
              months={months}
              byDay={byDay}
              loc={loc}
              monthLabel={monthLabel}
              onCursor={(m) => {
                setCursor(m);
                setSelectedDay(null);
              }}
              onOpenSheet={() => setSheetOpen(true)}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              reelsHref={reelsHref}
              pickDayLabel={t.shop.archivePickDay}
              shortDayFmt={shortDayFmt}
              countLabel={t.shop.archiveCount}
            />
          )
        )}
      </div>

      {/* 画面下の浮遊ボタン(スクロールしても検索に届く) */}
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-label={t.shop.archiveSearch}
        className="fixed bottom-24 start-4 z-40 flex items-center gap-2 rounded-full border border-hl-400/30 bg-panel-950/80 px-4 py-2.5 text-xs font-bold text-hl-300 shadow-[0_10px_30px_rgba(0,0,0,0.8),0_0_20px_rgb(var(--hl-500)/0.2)] backdrop-blur-2xl transition active:scale-95 md:bottom-6"
      >
        <CalendarSearch size={16} />
        {t.shop.archiveSearch}
      </button>

      {mounted &&
        sheetOpen &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex items-end justify-center" role="dialog" aria-modal="true">
            <button
              type="button"
              aria-label="close"
              onClick={() => setSheetOpen(false)}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />
            <div className="relative max-h-[82dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-line/30 bg-panel-950/95 p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-xl">
              <div className="mb-4 flex items-center justify-between">
                <p className="flex items-center gap-2 text-sm font-bold text-hl-300">
                  <CalendarSearch size={18} />
                  {t.shop.archiveSearch}
                </p>
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  aria-label="close"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-main/10 text-main"
                >
                  <X size={16} />
                </button>
              </div>

              {authors.length > 1 && (
                <div className="mb-5">
                  <p className="mb-2 text-[11px] tracking-widest text-hl-400/60">{t.shop.archiveWho}</p>
                  <div className="flex flex-wrap gap-2">
                    {[null, ...authors].map((a) => (
                      <button
                        key={a ?? "__all"}
                        type="button"
                        onClick={() => setAuthor(a)}
                        dir="auto"
                        className={
                          author === a
                            ? "rounded-full bg-gradient-to-r from-cta-light to-cta px-3 py-1.5 text-xs font-bold text-on-cta"
                            : "rounded-full border border-line/30 px-3 py-1.5 text-xs text-tone-300 transition hover:text-hl-300"
                        }
                      >
                        {a ?? t.shop.archiveAll}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <p className="mb-2 text-[11px] tracking-widest text-hl-400/60">{t.shop.archiveJumpTo}</p>
              <div className="space-y-4">
                {monthsByYear.map(([year, ms]) => (
                  <div key={year}>
                    <p className="mb-1.5 font-display text-sm text-tone-300">{year}</p>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {ms.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => jumpToMonth(m)}
                          className="rounded-xl border border-line/30 bg-panel-900/60 px-2 py-2.5 text-center transition hover:border-hl-400/50 hover:text-hl-300 active:scale-95"
                        >
                          <span className="block text-sm font-semibold text-tone-100">
                            {new Intl.DateTimeFormat(loc, { timeZone: JST, month: "long" }).format(
                              new Date(Date.UTC(Number(year), Number(m.slice(5)) - 1, 15)),
                            )}
                          </span>
                          <span className="block text-[10px] text-tone-500">{t.shop.archiveCount(byMonth.get(m)!.length)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function CalendarView({
  cursor,
  months,
  byDay,
  loc,
  monthLabel,
  onCursor,
  onOpenSheet,
  selectedDay,
  onSelectDay,
  reelsHref,
  pickDayLabel,
  shortDayFmt,
  countLabel,
}: {
  cursor: string;
  months: string[];
  byDay: Map<string, ArchiveItem[]>;
  loc: string;
  monthLabel: (key: string) => string;
  onCursor: (m: string) => void;
  onOpenSheet: () => void;
  selectedDay: string | null;
  onSelectDay: (d: string | null) => void;
  reelsHref: string;
  pickDayLabel: string;
  shortDayFmt: Intl.DateTimeFormat;
  countLabel: (n: number) => string;
}) {
  const [y, m] = cursor.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const weekdayFmt = new Intl.DateTimeFormat(loc, { timeZone: "UTC", weekday: "narrow" });
  // 2024-01-07は日曜。日曜始まりで7日分のラベルを作る。
  const weekdays = Array.from({ length: 7 }, (_, i) => weekdayFmt.format(new Date(Date.UTC(2024, 0, 7 + i))));

  // monthsは新しい順。「前の月」=配列で後ろ、「次の月」=配列で前。投稿のある月だけを行き来する。
  const idx = months.indexOf(cursor);
  const older = idx >= 0 && idx < months.length - 1 ? months[idx + 1] : null;
  const newer = idx > 0 ? months[idx - 1] : null;

  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const selectedItems = selectedDay ? (byDay.get(selectedDay) ?? []) : [];

  return (
    <div className="px-2">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          disabled={!older}
          onClick={() => older && onCursor(older)}
          aria-label="previous month"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line/30 text-tone-300 disabled:opacity-25 rtl:rotate-180"
        >
          <ChevronLeft size={18} />
        </button>
        <button type="button" onClick={onOpenSheet} className="font-display text-lg font-semibold text-hl-300">
          {monthLabel(cursor)}
        </button>
        <button
          type="button"
          disabled={!newer}
          onClick={() => newer && onCursor(newer)}
          aria-label="next month"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line/30 text-tone-300 disabled:opacity-25 rtl:rotate-180"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-tone-500">
        {weekdays.map((w, i) => (
          <span key={i}>{w}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <span key={`b${i}`} />;
          const key = `${cursor}-${String(day).padStart(2, "0")}`;
          const list = byDay.get(key);
          if (!list) {
            return (
              <span key={key} className="flex aspect-square items-center justify-center rounded-lg text-xs text-tone-600">
                {day}
              </span>
            );
          }
          const selected = selectedDay === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay(selected ? null : key)}
              className={`group relative aspect-square overflow-hidden rounded-lg bg-panel-900 ring-1 transition active:scale-95 ${
                selected ? "ring-2 ring-hl-400" : "ring-main/10"
              }`}
            >
              <Thumb item={list[0]} />
              <span className="absolute inset-0 bg-black/45" />
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-main drop-shadow">
                {day}
              </span>
              {list.length > 1 && (
                <span className="absolute bottom-0.5 end-0.5 min-w-[16px] rounded-full bg-hl-400 px-1 text-[9px] font-bold leading-4 text-on-accent">
                  {list.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        {selectedDay ? (
          <>
            <p className="px-1 pb-2 text-xs text-tone-300">
              {shortDayFmt.format(new Date(`${selectedDay}T12:00:00+09:00`))} ・ {countLabel(selectedItems.length)}
            </p>
            <div className={GRID_CLASS}>
              {selectedItems.map((it) => (
                <Tile key={it.id} item={it} href={reelsHref} dateLabel={shortDayFmt.format(new Date(it.at))} />
              ))}
            </div>
          </>
        ) : (
          <p className="py-4 text-center text-xs text-tone-500">{pickDayLabel}</p>
        )}
      </div>
    </div>
  );
}
