import type { ReelItem } from "@/lib/reels/types";
import { shopPath, castPath, staffPath } from "@/lib/locapass/publicUrls";

type ReelLinkFields = Pick<
  ReelItem,
  "castId" | "shopId" | "shopSlug" | "portalSlug" | "castIssueNo" | "staffId" | "staffIssueNo"
>;

/**
 * 画像タップ・アバタータップ時の遷移先(投稿者がキャストならキャストマイページ、
 * スタッフならスタッフの公開マイページ、それ以外(店舗直接投稿)なら店舗詳細)。
 * 常にslugベースの公開URLを返す。
 */
export function reelProfileUrl(reel: ReelLinkFields): string {
  if (reel.castId && reel.castIssueNo != null) {
    return castPath(reel.portalSlug, reel.shopSlug, reel.castIssueNo);
  }
  if (reel.staffId && reel.staffIssueNo != null) {
    return staffPath(reel.portalSlug, reel.shopSlug, reel.staffIssueNo);
  }
  return shopPath(reel.portalSlug, reel.shopSlug);
}

/**
 * 詳しく見るCTAの遷移先。
 * 投稿時に任意URLが指定されていればそちらを優先し、未指定ならreelProfileUrl()と同じ既定のリンク先へ。
 */
export function reelCtaUrl(reel: Pick<ReelItem, "linkUrl"> & ReelLinkFields): string {
  if (reel.linkUrl) return reel.linkUrl;
  return reelProfileUrl(reel);
}
