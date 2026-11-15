import Link from "@/components/i18n/LocaleLink";
import {
  MIN_SHOPS_FOR_CITY_PAGE,
  categoryKeyword,
  categoryToSlug,
  cityCategoryPath,
  getCityAreas,
} from "@/lib/seo/cityAreas";

/** 先頭に固定で出す組み合わせ(いま検索で伸ばしたい「水戸 カフェ」)。店舗が基準に満たなければ自動で外れる。 */
const PRIORITY: { cityKey: string; category: string }[] = [{ cityKey: "茨城県水戸市", category: "カフェ・スイーツ" }];
const MAX_LINKS = 8;

/**
 * トップの最下部に出す「エリア × 業種」の入口。検索エンジンが「水戸のカフェ」などの専用ページへ
 * たどれるようにする(トップからのリンクがあるページは重要と判断されやすい)。表示は日本語のみ。
 */
export async function AreaCategoryLinks() {
  const areas = await getCityAreas().catch(() => []);
  const combos: { key: string; city: string; category: string; count: number }[] = [];
  for (const a of areas) {
    for (const [category, list] of a.byCategory) {
      if (list.length >= MIN_SHOPS_FOR_CITY_PAGE && categoryToSlug(category)) combos.push({ key: a.key, city: a.city, category, count: list.length });
    }
  }
  const picked: typeof combos = [];
  for (const p of PRIORITY) {
    const hit = combos.find((c) => c.key === p.cityKey && c.category === p.category);
    if (hit) picked.push(hit);
  }
  for (const c of combos.sort((x, y) => y.count - x.count)) {
    if (picked.length >= MAX_LINKS) break;
    if (!picked.includes(c)) picked.push(c);
  }
  if (picked.length === 0) return null;
  return (
    <nav aria-label="エリアとジャンルから探す" className="mx-2 space-y-2 pb-6 pt-2">
      <h2 className="text-xs font-semibold text-muted">エリアとジャンルから探す</h2>
      <ul className="flex flex-wrap gap-2">
        {picked.map((c) => (
          <li key={`${c.key}-${c.category}`}>
            <Link href={cityCategoryPath(c.key, categoryToSlug(c.category)!)} className="inline-block rounded-full border border-main/20 px-3 py-1 text-xs text-main hover:border-hl-400/60">
              {c.city}の{categoryKeyword(c.category)}({c.count})
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
