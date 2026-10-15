"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { genreLabel } from "@/lib/i18n/genreLabels";
import { isHiddenByDefaultGenre } from "@/lib/shop/genres";
import { OPEN_SEARCH_EVENT } from "@/lib/reels/events";
import { boostText } from "@/lib/boost/text";
import type { BoostItem } from "@/lib/boost/types";
import { BoostTile } from "./BoostTile";
import { BoostReelItem } from "./BoostReelItem";
import { BoostCard } from "./BoostCard";
import { useNow } from "./BoostCountdown";

const POLL_MS = 30_000;
/** 終了表示にしてからカードを消すまでの時間。 */
const FADE_MS = 6_000;

/**
 * 緊急ブースト一覧。トップページと同じ作り: 虫眼鏡検索+ジャンルタグで絞り込み → 正方形グリッド
 * (残り時間バッジ付き、時間切れが近い順)→ タップで縦スワイプ → タップで詳細カード → 店舗詳細へ。
 */
export function BoostFeed({ initial }: { initial: BoostItem[] }) {
  const { locale, t: dict } = useLocale();
  const t = boostText(locale);
  const [items, setItems] = useState(initial);
  const now = useNow(1000);
  const busy = useRef(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [activeGenres, setActiveGenres] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());

  const refetch = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const res = await fetch("/api/boost", { cache: "no-store" });
      if (res.ok) setItems(((await res.json()) as { items: BoostItem[] }).items);
    } catch {
      // 通信失敗時は今の表示を維持する(次の周期で再取得)。
    } finally {
      busy.current = false;
    }
  }, []);

  // 新着はRealtimeで即反映。取りこぼし・購読不可の端末向けに30秒ごと&タブ復帰時にも再取得する。
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel("boost-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "locapass_boost_posts" }, () => void refetch())
      .subscribe();
    const id = setInterval(() => void refetch(), POLL_MS);
    const onVis = () => document.visibilityState === "visible" && void refetch();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      void supabase.removeChannel(ch);
    };
  }, [refetch]);

  // ボトムナビの検索ボタンからも同じ検索を開く。
  useEffect(() => {
    const open = () => setSearchOpen(true);
    window.addEventListener(OPEN_SEARCH_EVENT, open);
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, open);
  }, []);

  // 時間切れが近い順(残りが短いものが先頭)。終了表示中のものも期限順で先頭側に残る。
  const alive = useMemo(
    () =>
      items
        .filter((b) => new Date(b.expiresAt).getTime() + FADE_MS > now)
        .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime()),
    [items, now],
  );

  const genreChoices = useMemo(
    () => Array.from(new Set(items.map((b) => b.shop.genre).filter((g): g is string => !!g))),
    [items],
  );

  const kw = keyword.trim().toLowerCase();
  const list = useMemo(
    () =>
      alive.filter((b) => {
        const g = b.shop.genre;
        if (activeGenres.length > 0) {
          if (!g || !activeGenres.includes(g)) return false;
        } else if (isHiddenByDefaultGenre(g)) {
          return false;
        }
        if (kw) {
          const hay = [b.shop.name, b.shop.address, b.title, b.discountTag, g ? genreLabel(locale, g) : ""].filter(Boolean).join(" ").toLowerCase();
          if (!hay.includes(kw)) return false;
        }
        return true;
      }),
    [alive, activeGenres, kw, locale],
  );

  const openIndex = openId ? list.findIndex((b) => b.id === openId) : -1;
  const detail = detailId ? items.find((b) => b.id === detailId) ?? null : null;

  // 縦リールを開いたら、タップしたカードの位置へ移動する。絞り込みで消えたら閉じる。
  useEffect(() => {
    if (openId && openIndex < 0) setOpenId(null);
  }, [openId, openIndex]);
  useEffect(() => {
    if (openId) itemRefs.current.get(openId)?.scrollIntoView({ behavior: "auto", block: "start" });
    // openIdが変わった(=開いた)ときだけ。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId === null]);
  const openTile = useCallback((i: number) => setOpenId(list[i]?.id ?? null), [list]);

  useEffect(() => {
    if (!searchOpen && !detailId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSearchOpen(false);
      setDetailId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen, detailId]);

  const toggleGenre = (g: string) => setActiveGenres((p) => (p.includes(g) ? p.filter((x) => x !== g) : [...p, g]));
  const reset = () => {
    setKeyword("");
    setActiveGenres([]);
  };
  const pill = (active: boolean) =>
    `shrink-0 rounded-full border px-3 py-1 text-xs whitespace-nowrap transition ${
      active ? "border-accent bg-accent text-on-accent font-semibold" : "border-tone-700 text-tone-300"
    }`;

  return (
    <div className="space-y-3 md:mx-auto md:max-w-[1400px] md:px-6 md:py-8">
      {searchOpen && (
        <div onClick={() => setSearchOpen(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl border border-main/10 bg-surface/95 p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-main">{dict.nav.search}</h2>
              <button type="button" onClick={() => setSearchOpen(false)} aria-label={dict.common.close} className="text-muted hover:text-main">
                ✕
              </button>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-tone-700 bg-main/5 px-3 py-2">
              <Search size={16} className="shrink-0 text-muted" />
              <input
                autoFocus
                type="search"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={t.search}
                className="w-full min-w-0 bg-transparent text-[16px] text-main placeholder:text-tone-500 focus:outline-none"
              />
            </div>
            {(keyword || activeGenres.length > 0) && (
              <button type="button" onClick={reset} className="mx-auto mt-3 block text-xs text-accent underline">
                {dict.feed.resetFilters}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="sticky top-[calc(81px+env(safe-area-inset-top))] z-30 flex items-center gap-2 border-b border-main/5 bg-tone-950/90 px-1 py-2 backdrop-blur-md">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label={dict.nav.search}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-tone-700 text-tone-300 transition hover:border-accent hover:text-accent"
        >
          <Search size={16} />
        </button>
        <div className="flex flex-1 gap-2 overflow-x-auto no-scrollbar">
          <span className="inline-flex shrink-0 items-center rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-1 text-xs font-black text-black">⚡ BOOST</span>
          {keyword && (
            <button type="button" onClick={reset} className={`${pill(true)} inline-flex items-center gap-1`}>
              {keyword}
              <X size={12} strokeWidth={3} />
            </button>
          )}
          {genreChoices
            .filter((g) => !isHiddenByDefaultGenre(g) || activeGenres.includes(g))
            .map((g) => (
              <button key={g} type="button" onClick={() => toggleGenre(g)} className={pill(activeGenres.includes(g))}>
                {genreLabel(locale, g)}
              </button>
            ))}
        </div>
      </div>

      {openIndex < 0 && <p className="px-2 text-[11px] text-tone-500">{t.lead}</p>}

      {list.length === 0 ? (
        <div className="px-2 py-14 text-center">
          <p className="text-base font-bold text-main">{items.length === 0 ? t.empty : t.none}</p>
          <p className="mt-1 text-sm text-tone-500">{items.length === 0 ? t.emptySub : ""}</p>
        </div>
      ) : openIndex < 0 ? (
        <div className="grid grid-cols-3 gap-[1px] sm:landscape:grid-cols-4 sm:portrait:grid-cols-6 md:landscape:grid-cols-6 md:gap-[2px] md:max-w-7xl md:mx-auto lg:landscape:grid-cols-8">
          {list.map((b, i) => (
            <BoostTile key={b.id} boost={b} index={i} now={now} endedLabel={t.ended} onOpen={openTile} />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <button type="button" onClick={() => setOpenId(null)} className="flex items-center gap-1 px-1 text-sm text-tone-300 hover:text-main">
            <ChevronLeft size={18} />
            {t.back}
          </button>
          {list.map((b) => (
            <div
              key={b.id}
              ref={(el) => {
                if (el) itemRefs.current.set(b.id, el);
                else itemRefs.current.delete(b.id);
              }}
              className="relative mx-auto aspect-[9/16] w-full overflow-hidden bg-black md:flex md:aspect-auto md:h-[85dvh] md:items-center md:justify-center"
            >
              <BoostReelItem boost={b} now={now} t={t} onOpen={() => setDetailId(b.id)} />
            </div>
          ))}
        </div>
      )}

      {/* 詳細カード(LINE予約・電話予約・地図・店舗詳細)。背景タップ/×で閉じる。 */}
      {detail && (
        <div onClick={() => setDetailId(null)} className="fixed inset-0 z-[60] overflow-y-auto bg-black/70 backdrop-blur-sm">
          <div className="flex min-h-full items-end justify-center sm:items-center">
          <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-lg p-3 pb-6">
            <button
              type="button"
              onClick={() => setDetailId(null)}
              aria-label={dict.common.close}
              className="absolute right-5 top-5 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white"
            >
              <X size={16} />
            </button>
            <BoostCard boost={detail} now={now} t={t} />
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
