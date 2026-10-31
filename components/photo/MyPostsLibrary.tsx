"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { PhotoPost } from "@/lib/photo/getPhotoPosts";
import { ShopUserPhotoGrid } from "@/components/shop/ShopUserPhotoGrid";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { dateLocaleTag, tagLabel } from "@/lib/photo/labels";

const PAGE = 60;
/** 場所のどれにも当てはまらない投稿の絞り込みキー(場所名と混ざらない値)。 */
const NO_PLACE = "\u0000none";

const monthKey = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit" }).format(new Date(iso)).slice(0, 7);

/**
 * マイページの「投稿写真」。月・場所・店舗・タグと、キーワード検索で、過去の投稿(写真・動画)を探せる。
 * 場所は、投稿が紹介している店舗のエリア(店舗が無ければ投稿された街=ポータル名)でまとめる。
 * 動画のように複数の店を紹介した投稿は、紹介した店舗すべてのエリアのボタンに出る。
 */
export function MyPostsLibrary({ posts, portalNames }: { posts: PhotoPost[]; portalNames: Record<string, string> }) {
  const { t, locale } = useLocale();
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState<string | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [visible, setVisible] = useState(PAGE);

  // 各投稿の絞り込み用の値(月・場所・検索用の文字列)を1回だけ計算する。
  const rows = useMemo(
    () =>
      posts.map((p) => {
        const fallbackPlace = p.site === "other" ? null : (portalNames[p.site] ?? null);
        const places = p.shops.length > 0
          ? Array.from(new Set(p.shops.map((s) => s.area ?? fallbackPlace).filter((x): x is string => Boolean(x))))
          : fallbackPlace ? [fallbackPlace] : [];
        const haystack = [p.spotName, p.comment, p.address, p.placeName, ...p.shops.map((s) => s.name), ...places, ...p.tags.map((x) => tagLabel(x, t.photo))]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return { post: p, month: monthKey(p.createdAt), places, haystack };
      }),
    [posts, portalNames, t.photo],
  );

  const monthLabel = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    return new Intl.DateTimeFormat(dateLocaleTag(locale), { year: "numeric", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
  };

  const count = <K,>(values: K[]) => {
    const map = new Map<K, number>();
    for (const v of values) map.set(v, (map.get(v) ?? 0) + 1);
    return map;
  };
  const months = useMemo(() => Array.from(count(rows.map((r) => r.month))).sort((a, b) => (a[0] < b[0] ? 1 : -1)), [rows]);
  const places = useMemo(
    () => Array.from(count(rows.flatMap((r) => (r.places.length > 0 ? r.places : [NO_PLACE])))).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), "ja")),
    [rows],
  );
  const tags = useMemo(() => Array.from(count(rows.flatMap((r) => r.post.tags))).sort((a, b) => b[1] - a[1]), [rows]);

  // 場所を選んだときだけ、そのエリアの店舗で絞れるようにする(店舗が2つ以上あるとき)。
  const shopsInPlace = useMemo(() => {
    if (!place || place === NO_PLACE) return [];
    const map = new Map<string, { id: string; name: string; n: number }>();
    for (const r of rows) {
      if (!r.places.includes(place)) continue;
      for (const s of r.post.shops) {
        if ((s.area ?? "") && s.area !== place) continue;
        const cur = map.get(s.id);
        map.set(s.id, { id: s.id, name: s.name, n: (cur?.n ?? 0) + 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.n - a.n);
  }, [rows, place]);

  const keyword = query.trim().toLowerCase();
  const filtered = rows
    .filter((r) => !month || r.month === month)
    .filter((r) => !place || (place === NO_PLACE ? r.places.length === 0 : r.places.includes(place)))
    .filter((r) => !shopId || r.post.shops.some((s) => s.id === shopId))
    .filter((r) => !tag || r.post.tags.includes(tag))
    .filter((r) => !keyword || r.haystack.includes(keyword))
    .map((r) => r.post);

  const anyFilter = Boolean(month || place || shopId || tag || keyword);
  const reset = () => {
    setQuery("");
    setMonth(null);
    setPlace(null);
    setShopId(null);
    setTag(null);
    setVisible(PAGE);
  };
  // 絞り込みを変えたら、表示件数は最初に戻す。
  const pick = <T,>(set: (v: T | null) => void, current: T | null, value: T) => {
    set(current === value ? null : value);
    setVisible(PAGE);
  };

  const chip = (active: boolean) =>
    `shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs transition ${
      active ? "border-hl-400 bg-hl-400/15 text-main" : "border-main/15 text-tone-300 hover:text-main"
    }`;
  const row = "flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
  const label = "shrink-0 text-[11px] text-tone-500";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-full border border-main/15 bg-main/5 px-3 py-2">
        <Search size={16} className="shrink-0 text-tone-500" />
        <input
          data-my-posts-search
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setVisible(PAGE);
          }}
          placeholder={t.mypage.libSearchPlaceholder}
          className="w-full min-w-0 bg-transparent text-[16px] text-main placeholder:text-tone-500 focus:outline-none"
        />
      </div>

      {months.length > 1 && (
        <div className={row}>
          <span className={label}>{t.mypage.libMonth}</span>
          <button type="button" onClick={() => { setMonth(null); setVisible(PAGE); }} className={chip(!month)}>{t.mypage.libAll}</button>
          {months.map(([key, n]) => (
            <button key={key} type="button" onClick={() => pick(setMonth, month, key)} className={chip(month === key)}>
              {monthLabel(key)} <span className="text-tone-500">{n}</span>
            </button>
          ))}
        </div>
      )}

      {places.length > 0 && (
        <div className={row}>
          <span className={label}>{t.mypage.libPlace}</span>
          <button type="button" onClick={() => { setPlace(null); setShopId(null); setVisible(PAGE); }} className={chip(!place)}>{t.mypage.libAll}</button>
          {places.map(([name, n]) => (
            <button
              key={name}
              type="button"
              onClick={() => { pick(setPlace, place, name); setShopId(null); }}
              className={chip(place === name)}
            >
              {name === NO_PLACE ? t.mypage.libNoPlace : name} <span className="text-tone-500">{n}</span>
            </button>
          ))}
        </div>
      )}

      {shopsInPlace.length > 1 && (
        <div className={row}>
          <span className={label}>{t.mypage.libShop}</span>
          <button type="button" onClick={() => { setShopId(null); setVisible(PAGE); }} className={chip(!shopId)}>{t.mypage.libAll}</button>
          {shopsInPlace.map((s) => (
            <button key={s.id} type="button" onClick={() => pick(setShopId, shopId, s.id)} className={chip(shopId === s.id)}>
              {s.name} <span className="text-tone-500">{s.n}</span>
            </button>
          ))}
        </div>
      )}

      {tags.length > 0 && (
        <div className={row}>
          <span className={label}>{t.mypage.libTag}</span>
          <button type="button" onClick={() => { setTag(null); setVisible(PAGE); }} className={chip(!tag)}>{t.mypage.libAll}</button>
          {tags.map(([name, n]) => (
            <button key={name} type="button" onClick={() => pick(setTag, tag, name)} className={chip(tag === name)}>
              #{tagLabel(name, t.photo)} <span className="text-tone-500">{n}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-tone-500">
        <span>{filtered.length} {t.mypage.libCount}</span>
        {anyFilter && (
          <button type="button" onClick={reset} className="text-accent underline">
            {t.mypage.libReset}
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-tone-500">{t.mypage.libNoResult}</p>
      ) : (
        <>
          {/* タブ内は左右に余白があるので、画面端まで広げて格子にする。 */}
          <div className="-mx-4">
            <ShopUserPhotoGrid posts={filtered.slice(0, visible)} />
          </div>
          {filtered.length > visible && (
            <button
              type="button"
              onClick={() => setVisible((v) => v + PAGE)}
              className="mx-auto block rounded-full border border-main/20 px-6 py-2 text-xs text-main hover:border-main/40"
            >
              {t.mypage.libMore}
            </button>
          )}
        </>
      )}
    </div>
  );
}
