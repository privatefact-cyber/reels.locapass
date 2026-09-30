"use client";

/**
 * 投稿直後に、そのリールの字幕(文字起こし+英語・中国語の翻訳)の生成を頼む。
 * 裏で走る処理なので待たない。失敗しても投稿自体には影響させない(字幕が付かないだけ)。
 * 生成するのは声のある動画だけで、BGMのみの動画はサーバー側で「声なし」として終わる。
 */
export function requestReelCaptions(reelId: string | null | undefined): void {
  if (!reelId) return;
  void fetch(`/api/reels/${reelId}/captions`, { method: "POST", keepalive: true }).catch(() => undefined);
}
