/**
 * エリア名(shops.area、自由入力)とURLスラッグの対応表。
 * SEO用ディレクトリ /tokyo/[city]/[category] のcityセグメントに使う。
 * 未登録のエリア名が来た場合はencodeURIComponentでフォールバックする
 * (見た目のスラッグは英字にならないが、URLとしては有効でクロール可能)。
 */
const AREA_SLUG_MAP: Record<string, string> = {
  渋谷: "shibuya",
  新宿: "shinjuku",
  池袋: "ikebukuro",
  六本木: "roppongi",
  中野: "nakano",
  銀座: "ginza",
  下北沢: "shimokitazawa",
  秋葉原: "akihabara",
  歌舞伎町: "kabukicho",
  恵比寿: "ebisu",
  中目黒: "nakameguro",
  上野: "ueno",
  五反田: "gotanda",
};

const SLUG_AREA_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(AREA_SLUG_MAP).map(([area, slug]) => [slug, area]),
);

export const PREFECTURE_SLUG = "tokyo";
export const PREFECTURE_LABEL = "東京都";

export function areaToSlug(area: string): string {
  return AREA_SLUG_MAP[area] ?? encodeURIComponent(area);
}

export function slugToArea(slug: string): string | null {
  if (SLUG_AREA_MAP[slug]) return SLUG_AREA_MAP[slug];
  try {
    const decoded = decodeURIComponent(slug);
    return decoded || null;
  } catch {
    return null;
  }
}

/** area×genreの組み合わせから /tokyo/[city]/[category] の全スラッグを重複無しで作る(sitemap.ts等で使用)。 */
export function listAreaCategorySlugs(
  shops: { area: string | null; genre: string | null }[],
  genreToSlug: (genre: string) => string | null,
): { city: string; category: string }[] {
  const seen = new Set<string>();
  const result: { city: string; category: string }[] = [];
  for (const s of shops) {
    if (!s.area || !s.genre) continue;
    const city = areaToSlug(s.area);
    const category = genreToSlug(s.genre);
    if (!category) continue;
    const key = `${city}/${category}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ city, category });
  }
  return result;
}
