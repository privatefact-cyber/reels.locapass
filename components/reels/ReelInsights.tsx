"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useOptionalReelOrganizer } from "@/components/reels/ReelOrganizer";
import { TAG_DEFS } from "@/lib/reels/tags/vocabulary";

/**
 * 投稿者だけが見られるインサイト(自分の動画の見られ方)。管理画面にだけ置く。
 * 数字はDBのRLSで「自分が投稿した/管理する動画」の分しか返らない(他人の分は取得できない)。
 *   閲覧者数       : 1秒以上表示された人数(同じ人は1日1回まで)
 *   しっかり見た率 : そのうち5秒以上見た人の割合
 * 投稿者本人・店舗スタッフの閲覧は数えない。計測開始より前の閲覧は記録が無いため、新しい動画ほど有利に見えないよう
 * 「1日あたり」で比べる。データが少ないうちは断定せず「目安」と表示する。
 */

export type InsightReel = {
  id: string;
  createdAt: string;
  tags: string[];
  likesCount: number;
  /** 一覧に出す名前(キャプションの頭など)。 */
  label: string;
};

type Stat = { viewers: number; engaged: number };
type TagSearch = { tag: string; searches: number; viewers: number };

const LABEL: Record<string, string> = Object.fromEntries(TAG_DEFS.map((t) => [t.id, t.labels.ja]));
const MIN_REELS_PER_TAG = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");
const fix1 = (n: number) => (Number.isFinite(n) ? (Math.round(n * 10) / 10).toString() : "—");

export function ReelInsights({
  reels,
  shopId,
  castId,
  variant = "dark",
}: {
  reels: InsightReel[];
  /** タグ検索の集計対象(店舗全体)。キャストの管理画面ならcastIdを渡す。どちらも無ければ「探されたタグ」は出さない。 */
  shopId?: string;
  castId?: string;
  variant?: "dark" | "light";
}) {
  const organizer = useOptionalReelOrganizer();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [stats, setStats] = useState<Record<string, Stat>>({});
  const [searches, setSearches] = useState<TagSearch[]>([]);
  const [startedAt, setStartedAt] = useState<string | null>(null);

  const light = variant === "light";
  const ui = {
    box: light ? "border-slate-200 bg-white" : "border-main/15 bg-surface",
    title: light ? "text-slate-800" : "text-tone-100",
    sub: light ? "text-slate-500" : "text-tone-500",
    body: light ? "text-slate-700" : "text-tone-300",
    strong: light ? "text-slate-900" : "text-main",
    cell: light ? "bg-slate-50" : "bg-black/20",
    line: light ? "border-slate-200" : "border-main/10",
    hint: light ? "bg-indigo-50 text-indigo-900" : "bg-accent/10 text-tone-100",
  };

  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      try {
        const ids = reels.map((r) => r.id);
        const [statRes, startedRes, searchRes] = await Promise.all([
          ids.length ? supabase.rpc("locapass_reel_stats", { p_reel_ids: ids }) : Promise.resolve({ data: [], error: null }),
          supabase.rpc("locapass_tracking_started_at"),
          shopId || castId
            ? supabase.rpc("locapass_tag_search_stats", { p_shop_id: castId ? undefined : shopId, p_cast_id: castId } as never)
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (cancelled) return;
        if (statRes.error || startedRes.error || searchRes.error) throw new Error("insights fetch failed");
        const byId: Record<string, Stat> = {};
        for (const row of (statRes.data ?? []) as { reel_id: string; viewers: number; engaged: number }[]) {
          byId[row.reel_id] = { viewers: Number(row.viewers), engaged: Number(row.engaged) };
        }
        setStats(byId);
        setStartedAt((startedRes.data as string | null) ?? null);
        setSearches(
          ((searchRes.data ?? []) as { tag: string; searches: number; viewers: number }[]).map((r) => ({
            tag: r.tag,
            searches: Number(r.searches),
            viewers: Number(r.viewers),
          })),
        );
        setLoaded(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, loaded, reels, shopId, castId]);

  const view = useMemo(() => {
    const tagsOf = (r: InsightReel) => organizer?.tagsOf(r.id) ?? r.tags;
    const since = startedAt ? new Date(startedAt).getTime() : Date.now();
    const rows = reels.map((r) => {
      const s = stats[r.id] ?? { viewers: 0, engaged: 0 };
      // 計測開始より前に投稿した動画は、開始以降の日数で割る(古い動画が不利/有利にならないように)。
      const from = Math.max(new Date(r.createdAt).getTime(), since);
      const days = Math.max(1, (Date.now() - from) / DAY_MS);
      return { ...r, tags: tagsOf(r), viewers: s.viewers, engaged: s.engaged, perDay: s.viewers / days };
    });

    const totalViewers = rows.reduce((a, r) => a + r.viewers, 0);
    const totalEngaged = rows.reduce((a, r) => a + r.engaged, 0);
    const totalLikes = rows.reduce((a, r) => a + r.likesCount, 0);
    const avgPerDay = rows.length ? rows.reduce((a, r) => a + r.perDay, 0) / rows.length : 0;

    const tagMap = new Map<string, typeof rows>();
    for (const r of rows) for (const t of r.tags) tagMap.set(t, [...(tagMap.get(t) ?? []), r]);
    const byTag = [...tagMap.entries()]
      .map(([tag, list]) => {
        const v = list.reduce((a, r) => a + r.viewers, 0);
        const e = list.reduce((a, r) => a + r.engaged, 0);
        return {
          tag,
          n: list.length,
          avgViewers: v / list.length,
          avgPerDay: list.reduce((a, r) => a + r.perDay, 0) / list.length,
          engagedRate: v > 0 ? e / v : null,
          avgLikes: list.reduce((a, r) => a + r.likesCount, 0) / list.length,
        };
      })
      .sort((a, b) => b.avgPerDay - a.avgPerDay);

    const top = [...rows].sort((a, b) => b.viewers - a.viewers).filter((r) => r.viewers > 0).slice(0, 3);
    const untagged = rows.filter((r) => r.tags.length === 0).length;
    const countByTag = new Map([...tagMap.entries()].map(([t, l]) => [t, l.length]));

    // 気づきは「数字から機械的に言えること」だけを、断定を避けて出す(AIの推測は入れない)。
    const hints: string[] = [];
    if (totalViewers < 20) {
      hints.push("まだ閲覧データが少ないため、下の傾向は目安です。数日〜数週間たまってから見ると、はっきりしてきます。");
    } else {
      const best = byTag.find((t) => t.n >= MIN_REELS_PER_TAG && avgPerDay > 0 && t.avgPerDay >= avgPerDay * 1.3);
      if (best) {
        hints.push(
          `「#${LABEL[best.tag] ?? best.tag}」の動画は、全体の平均より約${fix1(best.avgPerDay / avgPerDay)}倍見られています(${best.n}本の平均)。`,
        );
      }
    }
    const wanted = [...searches]
      .sort((a, b) => b.searches - a.searches)
      .find((s) => s.searches >= 3 && (countByTag.get(s.tag) ?? 0) <= 2);
    if (wanted) {
      hints.push(
        `訪問者は「#${LABEL[wanted.tag] ?? wanted.tag}」で探していますが、その動画は${countByTag.get(wanted.tag) ?? 0}本です。足すと見つけてもらいやすくなります。`,
      );
    }
    if (rows.length >= 5 && untagged / rows.length >= 0.3) {
      hints.push(`タグが付いていない動画が${untagged}本あります。タグを付けると、訪問者が絞り込みで見つけやすくなります。`);
    }

    return { rows, totalViewers, totalEngaged, totalLikes, byTag, top, hints, countByTag };
  }, [reels, stats, searches, startedAt, organizer]);

  if (reels.length === 0) return null;

  return (
    <div className={`mt-6 rounded-xl border ${ui.box}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold ${ui.title}`}
      >
        <span className="flex items-center gap-2">
          <BarChart3 size={16} />
          インサイト
          <span className={`text-[11px] font-normal ${ui.sub}`}>(あなただけに表示)</span>
        </span>
        <ChevronDown size={16} className={`transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className={`space-y-4 border-t px-4 pb-4 pt-3 text-xs ${ui.line} ${ui.body}`}>
          {failed ? (
            <p>読み込めませんでした。しばらくしてからもう一度開いてください。</p>
          ) : !loaded ? (
            <p>集計中…</p>
          ) : (
            <>
              <p className={ui.sub}>
                {startedAt
                  ? `計測は${new Date(startedAt).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}から。それ以前の閲覧は含まれません。`
                  : "まだ閲覧の記録がありません。動画が見られると、ここに出てきます。"}
                あなた自身や店舗スタッフの閲覧は数えていません。
              </p>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className={`rounded-lg p-2 ${ui.cell}`}>
                  <p className={`text-lg font-bold ${ui.strong}`}>{view.totalViewers}</p>
                  <p className={ui.sub}>延べ閲覧者</p>
                </div>
                <div className={`rounded-lg p-2 ${ui.cell}`}>
                  <p className={`text-lg font-bold ${ui.strong}`}>{pct(view.totalEngaged, view.totalViewers)}</p>
                  <p className={ui.sub}>しっかり見た率</p>
                </div>
                <div className={`rounded-lg p-2 ${ui.cell}`}>
                  <p className={`text-lg font-bold ${ui.strong}`}>{view.totalLikes}</p>
                  <p className={ui.sub}>いいね(全期間)</p>
                </div>
              </div>

              {view.hints.length > 0 && (
                <ul className="space-y-1.5">
                  {view.hints.map((h) => (
                    <li key={h} className={`rounded-lg px-3 py-2 ${ui.hint}`}>
                      {h}
                    </li>
                  ))}
                </ul>
              )}

              {view.byTag.length > 0 && (
                <div>
                  <p className={`mb-1.5 font-semibold ${ui.strong}`}>タグ別の見られ方</p>
                  <div className="overflow-x-auto" data-no-swipe>
                    <table className="w-full min-w-[320px] text-left">
                      <thead className={ui.sub}>
                        <tr>
                          <th className="py-1 pr-2 font-normal">タグ</th>
                          <th className="px-1 font-normal">本数</th>
                          <th className="px-1 font-normal">1本あたり閲覧</th>
                          <th className="px-1 font-normal">しっかり</th>
                          <th className="px-1 font-normal">いいね</th>
                        </tr>
                      </thead>
                      <tbody>
                        {view.byTag.map((t) => (
                          <tr key={t.tag} className={`border-t ${ui.line}`}>
                            <td className={`py-1.5 pr-2 font-semibold ${ui.strong}`}>#{LABEL[t.tag] ?? t.tag}</td>
                            <td className="px-1">{t.n}</td>
                            <td className="px-1">
                              {fix1(t.avgViewers)}
                              {t.n < MIN_REELS_PER_TAG && <span className={`ml-1 ${ui.sub}`}>少数</span>}
                            </td>
                            <td className="px-1">{t.engagedRate === null ? "—" : `${Math.round(t.engagedRate * 100)}%`}</td>
                            <td className="px-1">{fix1(t.avgLikes)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className={`mt-1 ${ui.sub}`}>
                    並び順は「1日あたりの閲覧」が多い順です(投稿日が違っても公平に比べるため)。本数が少ないタグは「少数」で、参考程度に見てください。
                  </p>
                </div>
              )}

              {view.top.length > 0 && (
                <div>
                  <p className={`mb-1.5 font-semibold ${ui.strong}`}>よく見られた動画 TOP{view.top.length}</p>
                  <ol className="space-y-1">
                    {view.top.map((r, i) => (
                      <li key={r.id} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate">
                          {i + 1}. {r.label}
                        </span>
                        <span className={`shrink-0 ${ui.sub}`}>
                          閲覧 {r.viewers} ・ しっかり {pct(r.engaged, r.viewers)}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {searches.length > 0 && (
                <div>
                  <p className={`mb-1.5 font-semibold ${ui.strong}`}>訪問者がタグで探した回数</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[...searches]
                      .sort((a, b) => b.searches - a.searches)
                      .map((s) => (
                        <span key={s.tag} className={`rounded-full px-2.5 py-1 ${ui.cell}`}>
                          #{LABEL[s.tag] ?? s.tag} <b className={ui.strong}>{s.searches}</b>
                          <span className={`ml-1 ${ui.sub}`}>(動画{view.countByTag.get(s.tag) ?? 0}本)</span>
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
