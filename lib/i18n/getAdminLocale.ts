import { cookies } from "next/headers";
import { ADMIN_LOCALE_COOKIE, isLanguageCode } from "@/lib/i18n/languages";
import { getServerLocale } from "@/lib/i18n/getServerLocale";

/**
 * 管理画面(店舗オーナー向け)の表示言語。公開サイトの表示言語とは別に選べる(外国人オーナーが母国語で使うため)。
 * 管理画面で選んでいなければ、公開サイトの表示言語に合わせる。
 */
export async function getAdminLocale(): Promise<string> {
  const cookieStore = await cookies();
  const value = cookieStore.get(ADMIN_LOCALE_COOKIE)?.value;
  return isLanguageCode(value) ? value : await getServerLocale();
}
