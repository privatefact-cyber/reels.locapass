"use client";

import { useCallback, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";

/**
 * リールの文章検索(「猫の動画」「雨の日の店内」など)の状態と、検索ボックス。
 * 検索は /api/reels/search に「いま画面に出ている動画のID」を渡して、合うIDを(近い順に)もらう。
 * 結果は一覧(グリッド)自身が受け取って、その場で絞り込む。別画面には出さない。
 */

export type ReelSearchState = { q: string; ids: string[]; terms: string[] };

export function useReelSearch(allIds: string[]) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState<ReelSearchState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<"failed" | "rate_limited" | null>(null);
  const seq = useRef(0);

  const run = useCallback(
    async (query: string) => {
      const text = query.trim();
      if (!text) return;
      const mine = ++seq.current;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/reels/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: text, ids: allIds }),
        });
        if (mine !== seq.current) return; // 新しい検索が始まっていたら、古い結果は捨てる
        if (!res.ok) {
          setError(res.status === 429 ? "rate_limited" : "failed");
          return;
        }
        const json = (await res.json()) as { ids?: string[]; terms?: string[] };
        setActive({ q: text, ids: json.ids ?? [], terms: json.terms ?? [] });
      } catch {
        if (mine === seq.current) setError("failed");
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    },
    [allIds],
  );

  const clear = useCallback(() => {
    seq.current++;
    setQ("");
    setActive(null);
    setError(null);
    setLoading(false);
  }, []);

  return { q, setQ, active, loading, error, run, clear };
}

const TEXT = {
  ja: { placeholder: "動画を文章で探す(例: 猫、ラテアート、雨の日)", search: "検索", found: (n: number) => `${n}本`, none: "合う動画が見つかりませんでした", failed: "検索できませんでした。少し待ってからもう一度お試しください", clear: "検索をやめる" },
  en: { placeholder: "Search videos (e.g. cat, latte art, rainy day)", search: "Search", found: (n: number) => `${n} ${n === 1 ? "video" : "videos"}`, none: "No matching videos", failed: "Search failed. Please try again in a moment", clear: "Clear search" },
  zh: { placeholder: "用文字搜索视频(例如:猫、拉花、雨天)", search: "搜索", found: (n: number) => `${n}个视频`, none: "没有找到相符的视频", failed: "搜索失败,请稍后再试", clear: "清除搜索" },
  ar: { placeholder: "ابحث عن الفيديوهات (مثال: قطة، لاتيه آرت، يوم ماطر)", search: "بحث", found: (n: number) => `${n}`, none: "لا توجد فيديوهات مطابقة", failed: "تعذّر البحث. حاول مرة أخرى بعد قليل", clear: "مسح البحث" },
} as const;

export function ReelSearchBox({ search, variant = "dark", className = "" }: { search: ReturnType<typeof useReelSearch>; variant?: "dark" | "light"; className?: string }) {
  const { locale } = useLocale();
  const t = TEXT[locale as keyof typeof TEXT] ?? TEXT.en;
  const light = variant === "light";
  const { q, setQ, active, loading, error, run, clear } = search;

  return (
    <div className={className}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(q);
        }}
        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 ${light ? "border-slate-300 bg-white" : "border-line/30 bg-panel-950/70"}`}
        data-no-swipe
      >
        <Search size={16} className={light ? "shrink-0 text-slate-400" : "shrink-0 text-tone-500"} />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.placeholder}
          maxLength={80}
          enterKeyHint="search"
          // 16px未満だとiPhoneで入力時に自動ズームされる。
          className={`min-w-0 flex-1 bg-transparent py-1 text-base outline-none ${light ? "text-slate-800 placeholder:text-slate-400" : "text-main placeholder:text-tone-500"}`}
        />
        <button
          type="submit"
          disabled={loading || !q.trim()}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold transition active:scale-95 disabled:opacity-40 ${light ? "bg-slate-900 text-white" : "bg-accent text-on-accent"}`}
        >
          {loading ? "…" : t.search}
        </button>
      </form>

      {active && (
        <div className="mt-2 flex flex-wrap items-center gap-2 px-1">
          <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${light ? "bg-slate-900 font-bold text-white" : "bg-accent font-bold text-on-accent"}`}>
            {active.terms.length > 0 ? active.terms.join(" ") : active.q}
            <span className="font-normal opacity-70">{t.found(active.ids.length)}</span>
            <button type="button" onClick={clear} aria-label={t.clear} className="-me-1 flex h-4 w-4 items-center justify-center rounded-full opacity-80 hover:opacity-100">
              <X size={12} />
            </button>
          </span>
          {active.ids.length === 0 && <span className={`text-xs ${light ? "text-slate-500" : "text-tone-500"}`}>{t.none}</span>}
        </div>
      )}
      {error && <p className="mt-2 px-1 text-xs text-red-500">{t.failed}</p>}
    </div>
  );
}
