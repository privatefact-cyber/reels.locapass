"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createReelPreviewVideo } from "@/lib/reels/prepareReelFile";

/**
 * マップのカード用の軽量プレビューを作ってアップロードし、公開URLを返す。
 * 作成・アップロードに失敗したらnull(reels.preview_urlを空のまま投稿し、カードは元動画で代用する)。
 *
 * folderは元動画と同じ(店舗ID/キャストID/スタッフID)にすること。
 * reelsバケットのアップロード権限はフォルダ名で判定している。
 */
export async function uploadReelPreview(
  supabase: SupabaseClient<Database>,
  folder: string,
  video: File,
): Promise<string | null> {
  const preview = await createReelPreviewVideo(video);
  if (!preview) return null;

  const ext = preview.type.includes("mp4") ? "mp4" : "webm";
  const path = `${folder}/${Date.now()}.preview.${ext}`;
  const { error } = await supabase.storage.from("reels").upload(path, preview, {
    contentType: preview.type,
  });
  if (error) return null;

  return supabase.storage.from("reels").getPublicUrl(path).data.publicUrl;
}
