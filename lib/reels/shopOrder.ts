/** 店舗詳細ページのリール並び: ピン留め(最大10件)が先頭、続いて手動の並び順。並び順が未設定の新着は、ピン以外の先頭に出る。 */
export const MAX_SHOP_PINNED_REELS = 10;

type Orderable = { shop_pinned_at?: string | null; shop_sort_order?: number | null };

/** 元の配列(新着順)を壊さずに、店舗ページ用の並びにした新しい配列を返す(安定ソート)。 */
export function sortForShopPage<T extends Orderable>(rows: T[]): T[] {
  const rank = (r: Orderable) => (r.shop_pinned_at ? 1 : 0);
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const pa = rank(a.r);
      const pb = rank(b.r);
      if (pa !== pb) return pb - pa;
      const oa = a.r.shop_sort_order ?? -1;
      const ob = b.r.shop_sort_order ?? -1;
      if (oa !== ob) return oa - ob;
      return a.i - b.i;
    })
    .map((x) => x.r);
}
