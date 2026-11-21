/**
 * 広告カードの画像(バナー)の規格。この規格に合わない画像は、登録できない(画面でも、サーバーでも弾く)。
 * 広告カードは、画像を大きく出す作り(上の枠はカードの上半分、下の枠は左側)なので、SNSのシェア画像と同じ横長(1200×628)に固定している。
 */
export const AD_BANNER = {
  width: 1200,
  height: 628,
  maxBytes: 1024 * 1024, // 1MB
  types: ["image/jpeg", "image/png", "image/webp"] as readonly string[],
} as const;

export const AD_BANNER_SPEC_TEXT = `${AD_BANNER.width}×${AD_BANNER.height}px の横長・JPEG/PNG/WebP・1MB以内`;

/** サイズ・形式・容量を確認する(ブラウザ側とサーバー側で共通の文言)。問題がなければ null。 */
export function adBannerProblem(info: { width: number; height: number; bytes: number; type: string }): string | null {
  if (!AD_BANNER.types.includes(info.type)) return `画像の形式は JPEG・PNG・WebP のどれかにしてください(いまの形式: ${info.type || "不明"})`;
  if (info.bytes > AD_BANNER.maxBytes) return `画像の容量は1MB以内にしてください(いまは ${(info.bytes / 1024 / 1024).toFixed(1)}MB)`;
  if (info.width !== AD_BANNER.width || info.height !== AD_BANNER.height) {
    return `画像のサイズは ${AD_BANNER.width}×${AD_BANNER.height}px にしてください(いまは ${info.width}×${info.height}px)`;
  }
  return null;
}
