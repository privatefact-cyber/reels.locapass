import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./locale";
import { LOCALE_HEADER, PUBLIC_PATH_HEADER, localizeHref } from "./localePath";

/**
 * Server Component / layout で現在の言語を読む。
 * 優先順位: URLの接頭辞(middlewareが x-locale ヘッダーで渡す) > Cookie > 既定(ja)。
 * 公開ページは接頭辞なしなら middleware が x-locale=ja を付けるので、Cookieに関係なく日本語になる
 * (クローラーはCookieなしで来るため、URLだけで言語が決まるようにしている)。
 * 管理画面・マイページ・API等の対象外パスはヘッダーが付かず、従来どおりCookieで決まる。
 */
export async function getServerLocale(): Promise<Locale> {
  const headerStore = await headers();
  const fromUrl = headerStore.get(LOCALE_HEADER);
  if (isLocale(fromUrl)) return fromUrl;
  const cookieStore = await cookies();
  const value = cookieStore.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** 公開ページなら接頭辞を外したパス(例 "/mito/shops/abc")。対象外パスでは null。 */
export async function getPublicPath(): Promise<string | null> {
  const headerStore = await headers();
  return headerStore.get(PUBLIC_PATH_HEADER);
}

/** サーバー側の redirect() 等で、今の言語のURLにする(例 "/mito/shops/abc" → "/en/mito/shops/abc")。 */
export async function localizedPath(path: string): Promise<string> {
  return localizeHref(path, await getServerLocale());
}
