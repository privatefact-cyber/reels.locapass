"use client";

/**
 * 投稿直後に、そのリールの字幕(文字起こし+英語・中国語の翻訳)の生成を頼む。
 * 裏で走る処理なので待たない。失敗しても投稿自体には影響させない(字幕が付かないだけ)。
 * 生成するのは声のある動画だけで、BGMのみの動画はサーバー側で「声なし」として終わる。
 */
export function requestReelCaptions(reelId: string | null | undefined): void {
  if (!reelId) return;
  // 投稿文の多言語翻訳も一緒に頼む(失敗しても投稿には影響しない)
  void fetch(`/api/reels/${reelId}/translate`, { method: "POST", keepalive: true }).catch(() => undefined);
  void fetch(`/api/reels/${reelId}/captions`, { method: "POST", keepalive: true }).catch(() => undefined);
}
