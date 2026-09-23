/**
 * 古いWordPress関連のURLをローカル画像に置き換える。
 * - wp-content
 * - placeholder-
 * - bakumatsu-
 * - /shops/ (旧URL形式)
 * - dev.locapass.net
 * - 不正なURL形式
 */
// 画像が無い/壊れている場合はundefinedを返す。呼び出し側はその値をそのまま
// (画像なし)として扱い、各コンポーネントが元々持っているLOCAPASSロゴの
// CSSプレースホルダー(値がnull/undefinedの時だけ表示される分岐)に委ねる。
// ここで固定の代替画像パスを返してしまうと、その分岐が二度と表示されなくなる。
export function sanitizeImageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;

  const urlStr = String(url).trim();

  // Google Places写真の中継URL。UUIDに"403"等が偶然含まれても弾かないよう先に通す。
  if (urlStr.startsWith("https://locapass.net/api/place-photo/")) return urlStr;

  // URLが有効か検証
  try {
    new URL(urlStr);
  } catch {
    // URLパースエラー: 無効なURLは除外
    return undefined;
  }

  // 古いWP関連URLパターンを検出
  if (
    urlStr.includes("wp-content") ||
    urlStr.includes("placeholder-") ||
    urlStr.includes("bakumatsu-") ||
    urlStr.includes("/shops/") ||
    urlStr.includes("dev.locapass.net") ||
    urlStr.includes("403") ||
    urlStr.includes("404")
  ) {
    return undefined;
  }

  // 相対URLや、明らかに動作しているURLは通す
  return urlStr;
}
