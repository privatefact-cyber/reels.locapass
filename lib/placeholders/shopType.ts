/**
 * 店舗の種類(店名・カテゴリから推定)と、その店に使ってよい写真の種類の対応。
 * 「コーヒー屋に蕎麦」「バーにとんかつ」のような不一致を避けるため。合う写真が無ければ街の風景を使う。
 */

/** 写真の分類(scripts/classify-placeholders.ts が付ける)。 */
export const PHOTO_LABELS = ["cafe", "bar", "noodle", "japanese_meal", "sushi", "grill", "western", "interior", "city", "unusable"] as const;
export type PhotoLabel = (typeof PHOTO_LABELS)[number];

export type ShopType =
  | "cafe" | "bar" | "izakaya" | "noodle" | "japanese" | "seafood" | "grill" | "western" | "restaurant"
  | "stay" | "tour" | "shopping" | "hair" | "pet" | "other";

const has = (s: string, re: RegExp) => re.test(s);

/** 店名とカテゴリから店の種類を推定する。 */
export function shopTypeOf(name: string, category: string | null | undefined): ShopType {
  const c = category ?? "";
  const n = name;

  if (/宿泊|ホテル|旅館/.test(c) && !/ペット/.test(c)) return "stay";
  if (/ホテル/.test(n) && !/カフェ/.test(n)) return "stay";
  if (/ペット|ドッグ|犬/.test(c) || /ドッグ|DOG|PAWS|サモエド|Wan-?Dining/i.test(n)) return "pet";
  if (/観光|体験/.test(c)) return "tour";
  if (/ショッピング|お土産/.test(c)) return "shopping";
  if (/美容|暮らし/.test(c)) {
    if (/花|フラワー|ブーケ|FLOWER/i.test(n)) return "other"; // 花屋に合う写真が無いので街の風景
    if (/pilates|ピラティス/i.test(n)) return "other";
    return "hair";
  }

  // 飲食
  if (/カフェ・スイーツ/.test(c)) return "cafe";
  if (/居酒屋|バー/.test(c)) return has(n, /bar|バー|ラウンジ|lounge|pub|パブ|LABO|ラボ|Miyashita|ミヤシタ/i) ? "bar" : "izakaya";
  if (/レストラン|食事/.test(c)) {
    if (has(n, /カフェ|cafe|coffee|珈琲|喫茶|サンドイッチ|DAYSMART|デイスマート/i)) return "cafe";
    if (has(n, /ラーメン|らーめん|麺|うどん|そば|蕎麦|ramen|noodle/i)) return "noodle";
    if (has(n, /寿司|鮨|すし|寿多庵|海鮮|魚|うなぎ|鰻|カキ|牡蠣|海のごはん|磯|漁協|お魚/)) return "seafood";
    if (has(n, /焼肉|焼き肉|ホルモン|ステーキ/)) return "grill";
    if (has(n, /とんかつ|豚|定食|天ぷら|丼|食堂|和食|割烹|むぎとろ|古民家|味処|飯|ごはん/)) return "japanese";
    if (has(n, /ピザ|パスタ|イタリア|トラットリア|ビストロ|バル|バーガー|ダイニング|bistro|pizza|burger/i)) return "western";
    return "restaurant";
  }
  if (/コミュニティ/.test(c)) return has(n, /カフェ|cafe|茶屋|喫茶/i) ? "cafe" : "other";
  return "other";
}

/** 店の種類ごとに、使ってよい写真の種類(優先順)。ここに無い・合う写真が尽きたら街の風景(city)を使う。 */
export const ALLOWED_PHOTO_LABELS: Partial<Record<ShopType, PhotoLabel[]>> = {
  cafe: ["cafe"],
  bar: ["bar", "interior"],
  izakaya: ["japanese_meal", "sushi", "grill", "interior"],
  noodle: ["noodle"],
  japanese: ["japanese_meal", "noodle"],
  seafood: ["sushi", "japanese_meal"],
  grill: ["grill"],
  western: ["western", "interior"],
  restaurant: ["western", "japanese_meal", "sushi", "grill", "interior"],
};

/** 飲食系(写真を種類で分けて選ぶ店)か。 */
export function isEateryType(t: ShopType): boolean {
  return t in ALLOWED_PHOTO_LABELS;
}
