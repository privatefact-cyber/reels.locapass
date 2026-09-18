export type Locale = "ja" | "en" | "zh";

export const LOCALES: Locale[] = ["ja", "en", "zh"];
export const DEFAULT_LOCALE: Locale = "ja";
export const LOCALE_COOKIE = "luxela_locale";

export const LOCALE_LABEL: Record<Locale, string> = {
  ja: "日本語",
  en: "English",
  zh: "中文",
};

export const LOCALE_SHORT_LABEL: Record<Locale, string> = {
  ja: "日",
  en: "EN",
  zh: "中",
};

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as string[]).includes(value);
}
