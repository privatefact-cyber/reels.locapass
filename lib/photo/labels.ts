import type { Locale } from "@/lib/i18n/locale";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { PhotoArea } from "@/lib/photo/getPhotoPosts";

type PhotoText = Dictionary["photo"];

/** 日付の表示に使うロケール。 */
export function dateLocaleTag(locale: Locale): string {
  return { ja: "ja-JP", en: "en-US", zh: "zh-CN", ar: "ar" }[locale];
}

/** エリア名: 日本語はそのまま、それ以外は英語名(無ければ日本語名)。'other'は「その他」。 */
export function areaLabel(area: PhotoArea, locale: Locale, t: PhotoText): string {
  if (area.slug === "other") return t.otherArea;
  return locale === "ja" ? area.name : area.nameEn || area.name;
}

/** タグ(日本語の保存値)を表示名にする。辞書に無いタグはそのまま。 */
export function tagLabel(tag: string, t: PhotoText): string {
  return t.tags[tag] ?? tag;
}
