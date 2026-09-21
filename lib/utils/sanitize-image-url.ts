/**
 * 古いWordPress関連のURLをローカル画像に置き換える。
 * - wp-content
 * - /images/no-image.jpg
 * - /images/no-image.jpg
 * - /images/no-image.jpg (旧URL形式)
 * - dev.locapass.net
 * - 不正なURL形式
 */
export function sanitizeImageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;

  const urlStr = String(url).trim();

  // URLが有効か検証
  try {
    new URL(urlStr);
  } catch {
    // URLパースエラー: 無効なURLは除外
    return "/images/no-image.jpg";
  }

  // 古いWP関連URLパターンを検出
  if (
    urlStr.includes("wp-content") ||
    urlStr.includes("/images/no-image.jpg") ||
    urlStr.includes("/images/no-image.jpg") ||
    urlStr.includes("/images/no-image.jpg") ||
    urlStr.includes("dev.locapass.net") ||
    urlStr.includes("403") ||
    urlStr.includes("404")
  ) {
    return "/images/no-image.jpg";
  }

  // 相対URLや、明らかに動作しているURLは通す
  return urlStr;
}
