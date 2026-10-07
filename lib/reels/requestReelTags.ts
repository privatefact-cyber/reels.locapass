"use client";

/**
 * 画像だけのリールを投稿した直後に、タグ付け(AI)を頼む。裏で走る処理なので待たない。
 * 動画は字幕の生成(requestReelCaptions)の後ろでタグが付くので、こちらは呼ばない。
 */
export function requestReelTags(reelId: string | null | undefined): void {
  if (!reelId) return;
  void fetch(`/api/reels/${reelId}/tags`, { method: "POST", keepalive: true }).catch(() => undefined);
}
