/** エリアフォトの自動タグの候補(WPプラグインの mpg_allowed_tags() と同じ内容)。増減はここ1か所で行う。 */
export const PHOTO_TAGS = [
  "グルメ",
  "カフェ",
  "自然・風景",
  "夜景",
  "歴史・寺社",
  "公園",
  "建築",
  "アート",
  "買い物",
  "祭り・イベント",
  "アクティビティ",
  "スパ・温泉",
] as const;

export const PHOTO_MAX_BYTES = 15 * 1024 * 1024;
export const PHOTO_ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
