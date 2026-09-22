"use server";

import { revalidatePath } from "next/cache";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { uploadFileToStream } from "@/lib/stream/uploadFileToStream";
import { streamPlaybackUrl } from "@/lib/stream/playback";

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

export async function createAd(formData: FormData) {
  await requireRootAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const linkUrl = String(formData.get("linkUrl") ?? "").trim();
  const frequency = Number(formData.get("frequency") ?? 10);
  const file = formData.get("file");

  if (!title) throw new Error("タイトルを入力してください");
  if (!linkUrl) throw new Error("リンク先URLを入力してください");
  if (!Number.isFinite(frequency) || frequency < 2) {
    throw new Error("表示頻度は2以上の数値で指定してください");
  }
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("写真か動画を選んでください");
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("ファイルサイズが大きすぎます(上限20MB)");
  }

  const isVideo = file.type.startsWith("video/");
  const supabase = await createClient();
  let mediaUrl: string;

  if (isVideo) {
    // 動画本体はCloudflare Streamへアップロードする。Supabase Storageは通さない。
    const uid = await uploadFileToStream(file);
    const playbackUrl = streamPlaybackUrl(uid);
    if (!playbackUrl) throw new Error("Cloudflare Stream の公開設定が不足しています");
    mediaUrl = playbackUrl;
  } else {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("locapass-ads").upload(path, file, {
      contentType: file.type,
    });
    if (uploadError) throw new Error(`アップロードに失敗しました: ${uploadError.message}`);
    const { data: publicUrlData } = supabase.storage.from("locapass-ads").getPublicUrl(path);
    mediaUrl = publicUrlData.publicUrl;
  }

  const { error: insertError } = await supabase.from("locapass_ads").insert({
    title,
    link_url: linkUrl,
    frequency: Math.round(frequency),
    media_type: isVideo ? "video" : "image",
    media_url: mediaUrl,
  });
  if (insertError) throw new Error(insertError.message);

  revalidatePath("/admin/ads");
}

export async function setAdActive(id: string, isActive: boolean) {
  await requireRootAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("locapass_ads").update({ is_active: isActive }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/ads");
}

export async function updateAdFrequency(id: string, formData: FormData) {
  await requireRootAdmin();
  const frequency = Number(formData.get("frequency") ?? 0);
  if (!Number.isFinite(frequency) || frequency < 2) {
    throw new Error("表示頻度は2以上の数値で指定してください");
  }
  const supabase = await createClient();
  const { error } = await supabase.from("locapass_ads").update({ frequency: Math.round(frequency) }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/ads");
}

export async function deleteAd(id: string) {
  await requireRootAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("locapass_ads").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/ads");
}
