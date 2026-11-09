/**
 * 属性ページ(/tag/ペット同伴可 など)を検索エンジンに見せる最低店舗数。
 * 店舗が少ない属性のページは中身が薄く、検索の評価を下げるので、それ未満は noindex にしてサイトマップにも載せない。
 */
export const MIN_SHOPS_FOR_ATTRIBUTE_PAGE = 5;
