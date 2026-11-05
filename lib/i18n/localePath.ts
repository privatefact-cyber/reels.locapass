import { SITE_ORIGIN } from "@/lib/siteOrigin";
import { DEFAULT_LOCALE, LOCALES, isLocale, type Locale } from "./locale";

/**
 * 公開ページの言語別URL(検索エンジン向け)。
 * 日本語は接頭辞なし(今までのURLのまま)、英語・中国語・アラビア語は /en /zh /ar を先頭に付ける。
 * middleware.ts が接頭辞を外して今のルートへ内部rewriteし、言語はリクエストヘッダーで渡す。
 * ページファイルは言語ごとに複製しない。
 */

/** URLの先頭に付く言語(日本語は付かない)。ポータルslugの予約語でもある。 */
export const PREFIXED_LOCALES = LOCALES.filter((l) => l !== DEFAULT_LOCALE);

/** middleware → サーバー描画へ、URLから決めた言語を渡すヘッダー。 */
export const LOCALE_HEADER = "x-locale";
/** middleware → サーバー描画へ、接頭辞を外した公開パスを渡すヘッダー(hreflang・canonicalの組み立て用)。 */
export const PUBLIC_PATH_HEADER = "x-locapass-path";

/**
 * 言語別URLにしないパス(管理画面・マイページ・ログイン・API等)。接頭辞なし・hreflangなし。
 * ここに来たときの言語は従来どおりCookieで決まる。
 */
const UNLOCALIZED_PREFIXES = [
  "/admin",
  "/dashboard",
  "/mypage",
  "/gate",
  "/login",
  "/cast/login",
  "/cast/recover",
  "/cast/link",
  "/staff/login",
  "/staff/link",
  "/shop-recover",
  "/auth",
  "/api",
  "/embed",
  "/pet", // ワンコ手帳(当面は日本語のみ)
  "/lp",
  "/_next",
];
const UNLOCALIZED_FILES = new Set([
  "/favicon.ico",
  "/icon.png",
  "/apple-icon.png",
  "/robots.txt",
  "/sitemap.xml",
  "/webauth.html",
]);

export function isLocalizablePath(pathname: string): boolean {
  if (UNLOCALIZED_FILES.has(pathname)) return false;
  // 拡張子付き(public/ の画像など)は対象外
  if (/\.[a-z0-9]+$/i.test(pathname.split("/").pop() ?? "")) return false;
  return !UNLOCALIZED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** "/en/mito/shops/abc" → { locale: "en", path: "/mito/shops/abc" }。接頭辞なしは locale=null。 */
export function splitLocalePrefix(pathname: string): { locale: Locale | null; path: string } {
  const match = pathname.match(/^\/([a-z]{2})(?=\/|$)(.*)$/);
  if (match && isLocale(match[1]) && match[1] !== DEFAULT_LOCALE) {
    return { locale: match[1], path: match[2] || "/" };
  }
  return { locale: null, path: pathname };
}

/** 言語の接頭辞を外したパス。 */
export function stripLocalePrefix(pathname: string): string {
  return splitLocalePrefix(pathname).path;
}

/**
 * サイト内リンクを、指定した言語のURLにする共通関数。
 * "/mito/shops/abc?x=1" + "en" → "/en/mito/shops/abc?x=1"。
 * 外部URL・対象外パス(管理画面等)・日本語はそのまま(接頭辞を付けない)。既に接頭辞があれば付け替える。
 */
export function localizeHref(href: string, locale: Locale): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const cut = href.search(/[?#]/);
  const rawPath = cut === -1 ? href : href.slice(0, cut);
  const rest = cut === -1 ? "" : href.slice(cut);
  const path = stripLocalePrefix(rawPath);
  if (locale === DEFAULT_LOCALE || !isLocalizablePath(path)) return path + rest;
  return (path === "/" ? `/${locale}` : `/${locale}${path}`) + rest;
}

/** 絶対URL(canonical・hreflang・サイトマップ用)。 */
export function localeUrl(path: string, locale: Locale): string {
  const localized = localizeHref(path, locale);
  return localized === "/" ? SITE_ORIGIN : `${SITE_ORIGIN}${localized}`;
}

/** hreflang用: ja/en/zh/ar と x-default(=日本語URL)。 */
export function localeLanguageAlternates(path: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const l of LOCALES) languages[l] = localeUrl(path, l);
  languages["x-default"] = localeUrl(path, DEFAULT_LOCALE);
  return languages;
}

/** generateMetadata の alternates。canonical はそのページ自身の言語のURL。 */
export function localeAlternates(path: string, locale: Locale): { canonical: string; languages: Record<string, string> } {
  return { canonical: localeUrl(path, locale), languages: localeLanguageAlternates(path) };
}
