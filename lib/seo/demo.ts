/**
 * デモ(営業・動作確認用)の店舗かどうか。名前に「(デモ)」「(Demo)」「(デモ店)」「[サンプル]」などが付くもの、
 * またはURL名に demo を含むものは、実在の店舗ではないので、検索エンジンには見せない(サイトマップに入れない・noindex)。
 * サイト上の表示は、そのまま(営業のデモとして使えるように)。
 */
export function isDemoShop(name: string | null | undefined, slug?: string | null): boolean {
  if (slug && /demo/i.test(slug)) return true;
  if (!name) return false;
  return (
    /[（(［\[【]\s*(デモ店?|デモ|demo|sample|サンプル|Демо)\s*[）)］\]】]/i.test(name) ||
    /^\s*[\[【［]\s*(サンプル|デモ)/.test(name)
  );
}
