"use server";

import { revalidatePath } from "next/cache";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const ext = file.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
  const path = `ads/${Date.now()}.${ext}`;

  const supabase = createAdminClient();

  const { error: uploadError } = await supabase.storage.from("reels").upload(path, file, {
    contentType: file.type,
  });
  if (uploadError) throw new Error(`アップロードに失敗しました: ${uploadError.message}`);

  const { data: publicUrlData } = supabase.storage.from("reels").getPublicUrl(path);

  const { error: insertError } = await supabase.from("ads").insert({
    title,
    link_url: linkUrl,
    frequency: Math.round(frequency),
    media_type: isVideo ? "video" : "image",
    media_url: publicUrlData.publicUrl,
  });
  if (insertError) throw new Error(insertError.message);

  revalidatePath("/admin/ads");
}

export async function setAdActive(id: string, isActive: boolean) {
  await requireRootAdmin();
  const supabase = createAdminClient();
  const { error } = await supabase.from("ads").update({ is_active: isActive }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/ads");
}

export async function updateAdFrequency(id: string, formData: FormData) {
  await requireRootAdmin();
  const frequency = Number(formData.get("frequency") ?? 0);
  if (!Number.isFinite(frequency) || frequency < 2) {
    throw new Error("表示頻度は2以上の数値で指定してください");
  }
  const supabase = createAdminClient();
  const { error } = await supabase.from("ads").update({ frequency: Math.round(frequency) }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/ads");
}

export async function deleteAd(id: string) {
  await requireRootAdmin();
  const supabase = createAdminClient();
  const { error } = await supabase.from("ads").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/ads");
}
