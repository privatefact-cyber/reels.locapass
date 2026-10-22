"use client";

/**
 * 画像だけのリールを投稿した直後に、タグ付け(AI)を頼む。裏で走る処理なので待たない。
 * 動画は字幕の生成(requestReelCaptions)の後ろでタグが付くので、こちらは呼ばない。
 */
export function requestReelTags(reelId: string | null | undefined): void {
  if (!reelId) return;
  // 投稿文の多言語翻訳も一緒に頼む(失敗しても投稿には影響しない)
  void fetch(`/api/reels/${reelId}/translate`, { method: "POST", keepalive: true }).catch(() => undefined);
  void fetch(`/api/reels/${reelId}/tags`, { method: "POST", keepalive: true }).catch(() => undefined);
}
