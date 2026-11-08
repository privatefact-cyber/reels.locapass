/**
 * リール一覧の絞り込み条件(クライアントとサーバーで共用)。
 * リールは件数が増えるので、絞り込みはクライアントの取得済み分ではなく、サーバー(DB)側で行う。
 * 条件ごとに先頭から60件ずつ返し、続きはoffsetで足す。
 */
export type ReelAuthorFilter = "cast" | "shop";

export type ReelFeedFilter = {
  /** cast=FACES本人の投稿だけ / shop=店舗アカウントの投稿だけ / null=両方 */
  author: ReelAuthorFilter | null;
  /** 店舗のジャンル(選択中のもの)。空なら絞らない(ただしデフォルト非表示のジャンルは除く)。 */
  genres: string[];
  /** 店名・住所への部分一致キーワード。空なら絞らない。 */
  q: string;
};

export const EMPTY_REEL_FILTER: ReelFeedFilter = { author: null, genres: [], q: "" };

export const MAX_FILTER_GENRES = 20;
export const MAX_KEYWORD_LENGTH = 60;

/** PostgRESTのフィルタ文字列を壊す記号(% _ * \ " , ( ))を空白にして、前後の空白を整える。 */
export function normalizeKeyword(raw: string): string {
  return raw.replace(/[%_*\\",()]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_KEYWORD_LENGTH);
}

/** 条件が同じかどうかを比べるための文字列(取得済みのリールがどの条件のものかを覚えておく用)。 */
export function reelFilterKey(f: ReelFeedFilter): string {
  return JSON.stringify([f.author, [...f.genres].sort(), normalizeKeyword(f.q).toLowerCase()]);
}

export const EMPTY_REEL_FILTER_KEY = reelFilterKey(EMPTY_REEL_FILTER);

export function isEmptyReelFilter(f: ReelFeedFilter): boolean {
  return reelFilterKey(f) === EMPTY_REEL_FILTER_KEY;
}

/** /api/reels/feed のクエリ文字列に条件を足す。 */
export function appendReelFilterParams(qs: URLSearchParams, f: ReelFeedFilter) {
  if (f.author) qs.set("author", f.author);
  for (const g of f.genres.slice(0, MAX_FILTER_GENRES)) qs.append("genre", g);
  const q = normalizeKeyword(f.q);
  if (q) qs.set("q", q);
}

/** /api/reels/feed のクエリ文字列から条件を取り出す(不正な値は無視する)。 */
export function parseReelFilterParams(params: URLSearchParams): ReelFeedFilter {
  const author = params.get("author");
  return {
    author: author === "cast" || author === "shop" ? author : null,
    genres: params
      .getAll("genre")
      .map((g) => g.trim().slice(0, 40))
      .filter(Boolean)
      .slice(0, MAX_FILTER_GENRES),
    q: normalizeKeyword(params.get("q") ?? ""),
  };
}
