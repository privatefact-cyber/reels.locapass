import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { dictionaries } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locale";

/** サーバー(ページ・API)側で、閲覧者の言語のPHOTO用文言を取る(Cookieの言語設定に従う)。 */
export async function photoText(): Promise<{ locale: Locale; t: (typeof dictionaries)["ja"]["photo"] }> {
  const locale = await getServerLocale();
  return { locale, t: dictionaries[locale].photo };
}

/** AIに「この言語で書いて」と伝えるための言語名。 */
export const AI_LANGUAGE_NAME: Record<Locale, string> = {
  ja: "日本語",
  en: "English",
  zh: "简体中文",
  ar: "العربية (アラビア語)",
};
