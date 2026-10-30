import type { Locale } from "@/lib/i18n/locale";

/**
 * 店舗の文章が、公開サイトの4言語以外の言語(ネパール語・トルコ語など)で書かれているときの案内文。
 * 自動翻訳で読めるのに加え、「原文を見る」で、店舗が書いたそのままの文章を読める。
 */
export function autoTranslatedFromLabel(locale: Locale, native: string): string {
  switch (locale) {
    case "ja":
      return `店舗情報は${native}から自動翻訳しています`;
    case "zh":
      return `店铺信息由${native}自动翻译。`;
    case "ar":
      return `تفاصيل المتجر مترجمة آليًا من ${native}.`;
    default:
      return `Shop details are machine-translated from ${native}.`;
  }
}

export function showOriginalLabel(locale: Locale, native: string): string {
  switch (locale) {
    case "ja":
      return `原文を見る(${native})`;
    case "zh":
      return `查看原文(${native})`;
    case "ar":
      return `عرض النص الأصلي (${native})`;
    default:
      return `View original (${native})`;
  }
}

export function showTranslationLabel(locale: Locale): string {
  switch (locale) {
    case "ja":
      return "翻訳を見る";
    case "zh":
      return "查看翻译";
    case "ar":
      return "عرض الترجمة";
    default:
      return "View translation";
  }
}
