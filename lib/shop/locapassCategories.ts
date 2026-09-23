import { OFFICIAL_CATEGORY } from "@/lib/shop/genres";

/**
 * locapass の店舗「業種」(locapass_shops.category)の固定リスト。
 * 自由入力だと表記ゆれでフィードや地図のタグが増え続けるため、プルダウンで10種類に絞り、
 * どれにも当てはまらない店舗は「その他」に集める。増やす場合はここに足す
 * (表示ラベルは lib/i18n/genreLabels.ts にも追加する)。
 * 運営事務局の「公式」は一般の店舗が選ぶものではないので、このリストには含めない。
 */
export const LOCAPASS_CATEGORIES = [
  "カフェ・スイーツ",
  "レストラン・食事",
  "居酒屋・バー",
  "ショッピング",
  "観光・体験",
  "宿泊",
  "ペット",
  "美容・暮らし",
  "コミュニティ",
  "その他",
] as const;

export const CATEGORY_OTHER = "その他";

/**
 * 保存前の業種値を整える。空ならnull、固定リストにあればそのまま、
 * 無ければ「その他」に流す(古い画面や直接送信で自由入力が入っても増えないようにする)。
 * 「公式」は allowOfficial(その店舗が既に公式のとき)だけそのまま通す。
 */
export function normalizeCategory(raw: string, opts: { allowOfficial?: boolean } = {}): string | null {
  const v = raw.trim();
  if (!v) return null;
  if ((LOCAPASS_CATEGORIES as readonly string[]).includes(v)) return v;
  if (opts.allowOfficial && v === OFFICIAL_CATEGORY) return v;
  return CATEGORY_OTHER;
}
