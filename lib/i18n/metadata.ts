import { getServerLocale } from "./getServerLocale";
import { localeAlternates } from "./localePath";

/**
 * 公開ページの generateMetadata 用。path は接頭辞なしの日本語のパス(例 "/mito/shops/abc")。
 * url = そのページ自身の言語のURL(canonical・og:url)、alternates = canonical + hreflang(ja/en/zh/ar/x-default)。
 */
export async function localizedPageUrls(path: string) {
  const alternates = localeAlternates(path, await getServerLocale());
  return { url: alternates.canonical, alternates };
}
