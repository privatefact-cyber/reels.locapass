/**
 * 店舗ジャンルの固定カテゴリ。「風俗系」を連想させる表現を避け、
 * 水商売・ナイトワーク業態として明確な5カテゴリのみに限定する
 * (DB側は supabase/migrations/00049_shop_genre_fixed_categories.sql の
 * CHECK制約で同じ値のみを強制)。
 */
export const SHOP_GENRES = [
  "ガールズバー",
  "キャバクラ",
  "コンカフェ",
  "ラウンジ/クラブ",
  "スナック/バー",
  // 深夜営業の飲食店(同伴・アフター向け)。00071_shop_genre_after.sql で追加。
  "アフター",
] as const;

export type ShopGenre = (typeof SHOP_GENRES)[number];

export const AFTER_GENRE: ShopGenre = "アフター";

/**
 * 通常の検索・マップには出さず、そのジャンルのタグを押したときだけ表示するジャンル。
 * アフター(深夜飲食店)はナイトワークの店舗と並べると探しづらくなるため分けている。
 */
export const HIDDEN_BY_DEFAULT_GENRES: readonly string[] = [AFTER_GENRE];

export function isHiddenByDefaultGenre(genre: string | null | undefined): boolean {
  return !!genre && HIDDEN_BY_DEFAULT_GENRES.includes(genre);
}

/** SEO用ディレクトリ /tokyo/[city]/[category] のcategoryセグメント。 */
export const SHOP_GENRE_SLUGS: Record<ShopGenre, string> = {
  ガールズバー: "girls-bar",
  キャバクラ: "kyabakura",
  コンカフェ: "concept-cafe",
  "ラウンジ/クラブ": "lounge-club",
  "スナック/バー": "snack-bar",
  アフター: "after",
};

export function genreToSlug(genre: string): string | null {
  return (SHOP_GENRE_SLUGS as Record<string, string | undefined>)[genre] ?? null;
}

export function slugToGenre(slug: string): ShopGenre | null {
  const entry = (Object.entries(SHOP_GENRE_SLUGS) as [ShopGenre, string][]).find(
    ([, s]) => s === slug,
  );
  return entry ? entry[0] : null;
}
