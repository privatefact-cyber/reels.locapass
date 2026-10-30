import type { Locale } from "@/lib/i18n/locale";

/**
 * 店舗オーナーが管理画面で使える・原文として入力できる言語。
 * 公開サイトの表示言語(lib/i18n/locale.ts の4言語)とは別で、増やすときはここに足して、
 * scripts/translate-dashboard-ui.ts と scripts/translate-support-docs.ts を実行して管理画面の翻訳を作る。
 *   code    … ISO 639-1(中国語の繁体字だけ zh-TW)。DBの source_lang・管理画面の言語クッキーに使う
 *   native  … その言語での名前(プルダウンの表示。翻訳しない)
 *   english … 翻訳AIへの指示で使う名前
 */
export type LanguageInfo = { code: string; native: string; english: string; rtl?: boolean };

export const LANGUAGES: LanguageInfo[] = [
  { code: "ja", native: "日本語", english: "Japanese" },
  { code: "en", native: "English", english: "English" },
  { code: "zh", native: "简体中文", english: "Simplified Chinese" },
  { code: "zh-TW", native: "繁體中文", english: "Traditional Chinese (Taiwan)" },
  { code: "ne", native: "नेपाली", english: "Nepali" },
  { code: "vi", native: "Tiếng Việt", english: "Vietnamese" },
  { code: "id", native: "Bahasa Indonesia", english: "Indonesian" },
  { code: "my", native: "မြန်မာဘာသာ", english: "Burmese (Myanmar)" },
  { code: "th", native: "ไทย", english: "Thai" },
  { code: "pt", native: "Português", english: "Brazilian Portuguese" },
  { code: "tr", native: "Türkçe", english: "Turkish" },
  { code: "ru", native: "Русский", english: "Russian" },
  { code: "es", native: "Español", english: "Spanish (neutral, Latin America and Spain)" },
  { code: "ar", native: "العربية", english: "Modern Standard Arabic", rtl: true },
];

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code);

/** 管理画面の翻訳(カタログ・サポート)を作る言語。日本語が原本なので、日本語以外。 */
export const UI_TRANSLATION_LANGS = LANGUAGES.filter((l) => l.code !== "ja");

export function languageInfo(code: string | null | undefined): LanguageInfo | null {
  return LANGUAGES.find((l) => l.code === code) ?? null;
}

export function isLanguageCode(value: string | null | undefined): value is string {
  return !!value && LANGUAGE_CODES.includes(value);
}

/** 店舗ページなどの公開サイトの表示言語(4言語)に当たるか。当たらない言語は「原文を見る」で出す。 */
export function isSiteLocale(code: string): code is Locale {
  return code === "ja" || code === "en" || code === "zh" || code === "ar";
}

export const ADMIN_LOCALE_COOKIE = "locapass_admin_locale";
