"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { TAG_DEFS } from "@/lib/reels/tags/vocabulary";

/**
 * 自分用の管理画面(キャスト/スタッフ/店舗)で、自分の動画を整理するための絞り込み。
 *   - タグ(AIが自動で付けた分類。「タグなし」=未整理 だけを集めることもできる)
 *   - 投稿した月
 * 一覧の各タイルを <ReelOrganizerItem> で包むと、絞り込みに合わせて表示/非表示になる。
 * タグ編集モーダルで保存したタグは、ここに反映される(ReelTagEditor が setTags を呼ぶ)。
 */

export type OrganizerItem = { id: string; createdAt: string; tags: string[] };

/** 自分の他の動画と比べた見られ方(インサイトが計算して渡す)。hot=好調 / good=いい感じ / seed=これから。 */
export type Rating = { tier: "hot" | "good" | "seed"; ratio: number };

const UNTAGGED = "__untagged";
const JST = "Asia/Tokyo";
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: JST, year: "numeric", month: "2-digit", day: "2-digit" });
const LABEL: Record<string, string> = Object.fromEntries(TAG_DEFS.map((t) => [t.id, t.labels.ja]));

function monthOf(iso: string): string {
  return dayFmt.format(new Date(iso)).slice(0, 7);
}

type Ctx = {
  items: OrganizerItem[];
  tagsOf: (id: string) => string[];
  setTags: (id: string, tags: string[]) => void;
  ratings: Record<string, Rating>;
  setRatings: (r: Record<string, Rating>) => void;
  isVisible: (id: string) => boolean;
  tag: string | null;
  setTag: (t: string | null) => void;
  month: string | null;
  setMonth: (m: string | null) => void;
};

const OrganizerContext = createContext<Ctx | null>(null);

/** タグ編集ボタンなど、プロバイダの外でも使われる部品向け(外ならnull)。 */
export function useOptionalReelOrganizer(): Ctx | null {
  return useContext(OrganizerContext);
}

export function ReelOrganizerProvider({ items, children }: { items: OrganizerItem[]; children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<Record<string, string[]>>({});
  const [tag, setTag] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [ratings, setRatings] = useState<Record<string, Rating>>({});

  const value = useMemo<Ctx>(() => {
    const byId = new Map(items.map((i) => [i.id, i]));
    const tagsOf = (id: string) => overrides[id] ?? byId.get(id)?.tags ?? [];
    const isVisible = (id: string) => {
      const item = byId.get(id);
      if (!item) return true;
      if (month && monthOf(item.createdAt) !== month) return false;
      if (tag === UNTAGGED) return tagsOf(id).length === 0;
      if (tag && !tagsOf(id).includes(tag)) return false;
      return true;
    };
    return {
      items,
      tagsOf,
      setTags: (id, tags) => setOverrides((prev) => ({ ...prev, [id]: tags })),
      ratings,
      setRatings,
      isVisible,
      tag,
      setTag,
      month,
      setMonth,
    };
  }, [items, overrides, tag, month, ratings]);

  return <OrganizerContext.Provider value={value}>{children}</OrganizerContext.Provider>;
}

/** 一覧のタイル1枚を包む。絞り込みに合わなければ隠す(グリッドの並びは崩さない)。 */
export function ReelOrganizerItem({ id, children }: { id: string; children: React.ReactNode }) {
  const ctx = useContext(OrganizerContext);
  return <div className={!ctx || ctx.isVisible(id) ? "contents" : "hidden"}>{children}</div>;
}

/** タイルの上に重ねる小さなタグ表示(タップは下のリンクに通す)。 */
export function ReelTagBadges({ id, className }: { id: string; className?: string }) {
  const ctx = useContext(OrganizerContext);
  const tags = ctx?.tagsOf(id) ?? [];
  if (tags.length === 0) return null;
  return (
    <span className={className ?? "pointer-events-none absolute bottom-1 right-1 flex max-w-[70%] flex-wrap justify-end gap-0.5"}>
      {tags.map((t) => (
        <span key={t} className="rounded bg-black/70 px-1 py-0.5 text-[9px] text-main">
          #{LABEL[t] ?? t}
        </span>
      ))}
    </span>
  );
}

/** 絞り込みバー(タグのチップ+月の選択)。動画が無ければ出さない。 */
export function ReelOrganizerBar({ variant = "dark" }: { variant?: "dark" | "light" }) {
  const ctx = useContext(OrganizerContext);
  if (!ctx || ctx.items.length === 0) return null;

  const counts = new Map<string, number>();
  let untagged = 0;
  for (const it of ctx.items) {
    const tags = ctx.tagsOf(it.id);
    if (tags.length === 0) untagged++;
    for (const t of tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const tagList = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const months = [...new Set(ctx.items.map((i) => monthOf(i.createdAt)))].sort().reverse();
  const shown = ctx.items.filter((i) => ctx.isVisible(i.id)).length;
  const filtering = ctx.tag !== null || ctx.month !== null;

  // dark: キャスト/スタッフのマイページ(ダーク)。light: 店舗の管理画面(白地)。
  const light = variant === "light";
  const chip = (active: boolean) =>
    `flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs transition active:scale-95 ${
      active
        ? light
          ? "bg-slate-900 font-bold text-white"
          : "bg-accent font-bold text-on-accent"
        : light
          ? "border border-slate-300 text-slate-600 hover:text-slate-900"
          : "border border-main/20 text-tone-300 hover:text-main"
    }`;

  return (
    <div className="mt-6 space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className={`text-xs ${light ? "text-slate-500" : "text-tone-500"}`}>
          自分の動画を整理{filtering ? `(${shown}本 / 全${ctx.items.length}本)` : `(全${ctx.items.length}本)`}
        </p>
        <select
          value={ctx.month ?? ""}
          onChange={(e) => ctx.setMonth(e.target.value || null)}
          aria-label="投稿した月で絞り込み"
          // 16px未満だとiPhoneで入力時に自動ズームされる。
          className={`rounded-lg border px-2 py-1 text-base ${light ? "border-slate-300 bg-white text-slate-700" : "border-main/20 bg-surface text-tone-300"}`}
        >
          <option value="">すべての月</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {m.replace("-", "年")}月
            </option>
          ))}
        </select>
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-1 pb-1" data-no-swipe>
        <button type="button" onClick={() => ctx.setTag(null)} className={chip(ctx.tag === null)}>
          すべて
        </button>
        {tagList.map(([id, n]) => (
          <button key={id} type="button" onClick={() => ctx.setTag(ctx.tag === id ? null : id)} className={chip(ctx.tag === id)}>
            #{LABEL[id] ?? id} <span className="text-[10px] opacity-60">{n}</span>
          </button>
        ))}
        {untagged > 0 && (
          <button type="button" onClick={() => ctx.setTag(ctx.tag === UNTAGGED ? null : UNTAGGED)} className={chip(ctx.tag === UNTAGGED)}>
            タグなし <span className="text-[10px] opacity-60">{untagged}</span>
          </button>
        )}
      </div>
    </div>
  );
}

const RATING_UI: Record<Rating["tier"], { label: string; cls: string }> = {
  hot: { label: "🔥 好調", cls: "bg-orange-500/90 text-white" },
  good: { label: "👍 いい感じ", cls: "bg-emerald-600/90 text-white" },
  seed: { label: "🌱 これから", cls: "bg-black/70 text-main" },
};

/** タイルの上に重ねる評価バッジ(タップは下のリンクに通す)。評価が無い動画(データ不足・投稿直後)には出さない。 */
export function ReelRatingBadge({ id, className }: { id: string; className?: string }) {
  const ctx = useContext(OrganizerContext);
  const rating = ctx?.ratings[id];
  if (!rating) return null;
  const ui = RATING_UI[rating.tier];
  return (
    <span
      className={`pointer-events-none ${className ?? "absolute bottom-1 right-1"} rounded px-1.5 py-0.5 text-[10px] font-semibold ${ui.cls}`}
      title={rating.tier === "seed" ? "あなたの他の動画より、見られ方がこれから" : `あなたの動画の平均の約${Math.round(rating.ratio * 10) / 10}倍見られています`}
    >
      {ui.label}
    </span>
  );
}
