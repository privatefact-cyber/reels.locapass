"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Search, X } from "lucide-react";
import { EventGridCard } from "@/components/EventGridCard";
import { EventExpandedCard } from "@/components/EventExpandedCard";
import type { PortalEvent } from "@/lib/types/shop";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { genreLabel } from "@/lib/i18n/genreLabels";
import { OPEN_SEARCH_EVENT } from "@/lib/reels/events";

export function EventReel({
  events,
  genreChoices,
}: {
  events: PortalEvent[];
  genreChoices: string[];
}) {
  const { locale, t } = useLocale();
  const [activeGenres, setActiveGenres] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const overlayItemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const filtered = events.filter((e) => {
    if (activeGenres.length && !(e.genre && activeGenres.includes(e.genre))) return false;
    if (keyword) {
      const haystack = `${e.title} ${e.shopName} ${e.area ?? ""}`.toLowerCase();
      if (!haystack.includes(keyword.toLowerCase())) return false;
    }
    return true;
  });

  function toggleGenre(g: string) {
    setOpenIndex(null);
    setActiveGenres((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }

  // タップしたイベントの位置まで一気に送る(ランキング/トップのグリッド→縦スワイプと同じ挙動)。
  useEffect(() => {
    if (openIndex === null) return;
    overlayItemRefs.current[openIndex]?.scrollIntoView({ behavior: "auto", block: "start" });
  }, [openIndex]);

  useEffect(() => {
    if (openIndex === null) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenIndex(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openIndex]);

  function clearKeyword() {
    setKeywordInput("");
    setKeyword("");
    setOpenIndex(null);
  }

  // 検索語は打つたびに絞り込む(ランキングと同じく少し待ってから確定)。
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setKeyword(keywordInput.trim());
      setOpenIndex(null);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [keywordInput]);

  // ボトムナビの検索ボタンからもこのページの検索をその場で開く(トップへは遷移させない)。
  useEffect(() => {
    function handleOpenSearch() {
      setSearchOpen((v) => !v);
    }
    window.addEventListener(OPEN_SEARCH_EVENT, handleOpenSearch);
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, handleOpenSearch);
  }, []);

  // トップページと同じく、ヘッダー/ボトムナビを残したページの通常フローに乗る
  // グリッド表示に統一する(以前のモバイル版はフルスクリーン縦スナップ1枚送りで、
  // 一覧性が低く分かりにくかったため)。
  return (
    <div className="space-y-3 md:mx-auto md:max-w-[1400px] md:px-6 md:py-8">
      {searchOpen && (
        <div
          onClick={() => setSearchOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-main/10 bg-surface/95 p-4 shadow-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-main">イベント検索</h2>
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                aria-label={t.common.close}
                className="text-muted hover:text-main"
              >
                ✕
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setKeyword(keywordInput.trim());
                setOpenIndex(null);
                setSearchOpen(false);
              }}
              className="flex items-center gap-2 rounded-full border border-tone-700 bg-main/5 px-3 py-2"
            >
              <Search size={16} className="shrink-0 text-muted" />
              <input
                autoFocus
                type="search"
                enterKeyHint="search"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                placeholder="イベント名・店舗名・エリア(例:六本木)"
                className="w-full min-w-0 bg-transparent text-[16px] text-main placeholder:text-tone-500 focus:outline-none"
              />
            </form>
            {keywordInput && (
              <button type="button" onClick={clearKeyword} className="mx-auto mt-3 block text-xs text-accent underline">
                {t.feed.resetFilters}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 px-1">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label={t.nav.search}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-tone-700 text-tone-300 transition hover:border-accent hover:text-accent"
        >
          <Search size={16} />
        </button>
        <div className="flex flex-1 gap-2 overflow-x-auto no-scrollbar">
          {keyword && (
            <button
              type="button"
              onClick={clearKeyword}
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-accent bg-accent px-3 py-1 text-xs font-semibold text-on-accent"
            >
              {keyword}
              <X size={12} strokeWidth={3} />
            </button>
          )}
          {genreChoices.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => toggleGenre(g)}
              className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs transition ${
                activeGenres.includes(g)
                  ? "border-accent bg-accent font-semibold text-on-accent"
                  : "border-tone-700 text-tone-300"
              }`}
            >
              {genreLabel(locale, g)}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="px-2 py-16 text-center text-sm text-tone-500">{t.feed.noEvents}</p>
      ) : openIndex === null ? (
        <div className="grid grid-cols-3 gap-[1px] sm:landscape:grid-cols-4 sm:portrait:grid-cols-6 md:landscape:grid-cols-6 md:gap-[2px] md:max-w-7xl md:mx-auto lg:landscape:grid-cols-8">
          {filtered.map((event, index) => (
            <EventGridCard key={event.id} event={event} index={index} onOpen={setOpenIndex} />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setOpenIndex(null)}
            className="flex items-center gap-1 px-1 text-sm text-tone-300 hover:text-main"
          >
            <ChevronLeft size={18} />
            グリッドに戻る
          </button>
          {filtered.map((event, index) => (
            <div
              key={event.id}
              ref={(el) => {
                overlayItemRefs.current[index] = el;
              }}
              className="relative mx-auto w-full overflow-hidden md:flex md:h-[85dvh] md:items-center md:justify-center"
            >
              <div
                aria-hidden
                className="absolute inset-0 hidden scale-110 bg-tone-950 bg-cover bg-center blur-2xl brightness-[0.45] md:block"
                style={{ backgroundImage: `url(${event.imageUrl})` }}
              />
              <EventExpandedCard event={event} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
