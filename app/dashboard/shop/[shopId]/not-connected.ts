"use server";

/**
 * LUXELA本家の店舗管理画面にある機能のうち、locapass側にまだ受け皿が無いもの。
 * 画面(UI)は本家と同じものを出すが、DBには一切書き込まず「未接続」であることをそのまま伝える。
 *
 * マップのカード動画(本家 shops.map_video_enabled / map_preview_reel_id)は、locapass_shops に
 * 動画オプション契約・選択リールの列が無いため未接続。
 */
const NOT_CONNECTED = "この機能はまだlocapassのデータベースに接続されていません";

export async function setMapPreviewReel(_reelId: string | null) {
  throw new Error(NOT_CONNECTED);
}
