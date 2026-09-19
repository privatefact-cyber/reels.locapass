"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createReelPreviewVideo } from "@/lib/reels/prepareReelFile";

/**
 * マップのカード用の軽量プレビューを作ってアップロードし、公開URLを返す(本家と同じ仕組み)。
 * 作成・アップロードに失敗したらnull(locapass_reels.preview_urlを空のまま投稿し、カードは元動画で代用する)。
 *
 * 保存先は元動画と同じ locapass-reels バケットの店舗フォルダ(shopId)。
 * バケットのアップロード権限は店舗フォルダ名で判定している(店舗スタッフ以上・その店舗のキャスト)。
 */
export async function uploadReelPreview(
  supabase: SupabaseClient<Database>,
  shopId: string,
  video: File,
): Promise<string | null> {
  const preview = await createReelPreviewVideo(video);
  if (!preview) return null;

  const ext = preview.type.includes("mp4") ? "mp4" : "webm";
  const path = `${shopId}/${Date.now()}.preview.${ext}`;
  const { error } = await supabase.storage.from("locapass-reels").upload(path, preview, {
    contentType: preview.type,
  });
  if (error) return null;

  return supabase.storage.from("locapass-reels").getPublicUrl(path).data.publicUrl;
}
