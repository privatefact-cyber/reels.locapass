/**
 * 写真の壁の「ダミー写真」プリセット(業種ごと)。投稿写真が少ない店舗の壁を埋め、投稿が増えるほど押し出される。
 * 画像は public/photo-wall/<id>/01.jpg〜<DUMMY_PER_PRESET>.jpg。業種(locapass_shops.category)に1対1で対応させる。
 * 特定の料理や商品が写ると店と合わなくなるので、素材は内装・光・ボケなど雰囲気寄りにする。
 */
export const DUMMY_PER_PRESET = 24;

export const PHOTO_WALL_PRESETS = [
  { id: "cafe", label: "カフェ・スイーツ", category: "カフェ・スイーツ" },
  { id: "restaurant", label: "レストラン・食事", category: "レストラン・食事" },
  { id: "izakaya", label: "居酒屋・バー", category: "居酒屋・バー" },
  { id: "shopping", label: "ショッピング", category: "ショッピング" },
  { id: "sightseeing", label: "観光・体験", category: "観光・体験" },
  { id: "stay", label: "宿泊", category: "宿泊" },
  { id: "pet", label: "ペット", category: "ペット" },
  { id: "beauty", label: "美容・暮らし", category: "美容・暮らし" },
  { id: "community", label: "コミュニティ", category: "コミュニティ" },
  { id: "other", label: "その他", category: "その他" },
] as const;

export type PhotoWallPresetId = (typeof PHOTO_WALL_PRESETS)[number]["id"];

export function isPresetId(v: unknown): v is PhotoWallPresetId {
  return typeof v === "string" && PHOTO_WALL_PRESETS.some((p) => p.id === v);
}

/** オーナーがプリセットを選んでいないときは、店舗の業種に合うプリセットを使う。 */
export function resolvePreset(selected: string | null | undefined, category: string | null | undefined): PhotoWallPresetId {
  if (isPresetId(selected)) return selected;
  return PHOTO_WALL_PRESETS.find((p) => p.category === category)?.id ?? "other";
}

export function dummyPhotoUrl(preset: PhotoWallPresetId, index: number): string {
  const n = (index % DUMMY_PER_PRESET) + 1;
  return `/photo-wall/${preset}/${String(n).padStart(2, "0")}.jpg`;
}
