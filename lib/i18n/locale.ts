export type Locale = "ja" | "en" | "zh" | "ar";

export const LOCALES: Locale[] = ["ja", "en", "zh", "ar"];

/** 右から左に読む言語。<html dir> の切り替えに使う。 */
export const RTL_LOCALES: Locale[] = ["ar"];
export function localeDir(locale: Locale): "rtl" | "ltr" {
  return RTL_LOCALES.includes(locale) ? "rtl" : "ltr";
}
export const DEFAULT_LOCALE: Locale = "ja";
export const LOCALE_COOKIE = "luxela_locale";

export const LOCALE_LABEL: Record<Locale, string> = {
  ja: "日本語",
  en: "English",
  zh: "中文",
  ar: "العربية",
};

export const LOCALE_SHORT_LABEL: Record<Locale, string> = {
  ja: "日",
  en: "EN",
  zh: "中",
  ar: "عربي",
};

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as string[]).includes(value);
}
