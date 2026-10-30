import { asStoredTranslations, pickTranslation } from "@/lib/i18n/contentTranslation";
import { isSiteLocale, languageInfo } from "@/lib/i18n/languages";
import type { Locale } from "@/lib/i18n/locale";

/**
 * 投稿(リール・スナップ)の文章が、公開サイトの4言語以外(ポルトガル語・ネパール語など)で書かれているとき、
 * 画面で「原文を見る」を出すための情報。翻訳費用はかからない(翻訳済みの文に加えて、書かれたままの原文を渡すだけ)。
 * 4言語の文章は、ヘッダーの言語切替で読めるので、原文のボタンは出さない。サーバー専用。
 */
export type OriginalText = { text: string; lang: string };

/** その言語の名前(その言語自身の表記)。ポルトガル語なら Português。登録外の言語もICUの辞書で出す。 */
export function nativeLanguageName(code: string): string {
  const known = languageInfo(code);
  if (known) return known.native;
  try {
    return new Intl.DisplayNames([code], { type: "language" }).of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

/** 原文の言語が4言語以外なら、その言語名を返す(無ければ null)。 */
export function extraSourceLang(stored: unknown): string | null {
  const source = asStoredTranslations(stored).source_lang;
  return source && !isSiteLocale(source) ? source : null;
}

/**
 * 表示言語に合わせた文(翻訳があれば翻訳)と、4言語以外の原文のとき用の「書かれたままの原文」を返す。
 * 翻訳が無い(原文をそのまま出している)ときは、原文のボタンは要らないので original は null。
 */
export function withOriginal(
  locale: Locale,
  original: string | null,
  stored: unknown,
  key: string,
): { text: string | null; original: OriginalText | null } {
  const picked = pickTranslation(locale, original, stored, key);
  const source = extraSourceLang(stored);
  if (!original || !source || !picked.translated) return { text: picked.text, original: null };
  return { text: picked.text, original: { text: original, lang: nativeLanguageName(source) } };
}
