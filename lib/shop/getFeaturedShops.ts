import type { Locale } from "@/lib/i18n/locale";
import type { FeaturedShop } from "@/components/home/FeaturedHero";

/**
 * トップページのFEATURED枠(ヒーロー+特集カード)に出す提携店舗。
 *
 * LUXELA本家から複製した実装は、LUXELAの shops.featured_rank / shop_price_items /
 * platform_settings を読んでおり、locapassのトップにLUXELAの店舗が出る状態だったため削除した。
 * locapass_shops には特集店舗を選ぶ列(featured_rank相当)も表示設定のテーブルも無いので、
 * 現在は常に空を返す(FeaturedSection は空なら何も表示しない)。
 * locapass側で特集店舗を持たせる場合は、locapass_ テーブルに受け皿を作ってからここで読む。
 */
export async function getFeaturedShops(_locale: Locale, _limit = 8): Promise<FeaturedShop[]> {
  return [];
}
