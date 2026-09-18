import type { ReelItem } from "@/lib/reels/types";

/**
 * 詳しく見るCTA・画像中央タップの遷移先。
 * 投稿時に任意URLが指定されていればそちらを優先し、未指定なら既定のリンク先
 * (投稿者がキャストならキャストマイページ、店舗スタッフなら店舗詳細)へ。
 */
export function reelCtaUrl(reel: Pick<ReelItem, "castId" | "shopId" | "linkUrl">): string {
  if (reel.linkUrl) return reel.linkUrl;
  return reel.castId ? `/cast/${reel.castId}` : `/shops/${reel.shopId}`;
}
