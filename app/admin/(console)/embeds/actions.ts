"use server";

import { revalidatePath } from "next/cache";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { youtubeThumbUrl } from "@/lib/embed";
import { expandShortVideoUrl, parseVideoUrlWithShortLinks } from "@/lib/video-resolve";
import type { VideoRef } from "@/lib/video";

const MAX_THUMB_BYTES = 3 * 1024 * 1024;

type Admin = ReturnType<typeof createAdminClient>;

async function uploadThumb(admin: Admin, bytes: ArrayBuffer, contentType: string): Promise<string | null> {
  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const path = `embed-thumbs/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await admin.storage.from("locapass-reels").upload(path, bytes, { contentType });
  if (error) return null;
  return admin.storage.from("locapass-reels").getPublicUrl(path).data.publicUrl;
}

/**
 * 一覧に出すサムネイル。優先順: 運営者がアップロードした画像 → YouTube(識別子から直接) → TikTok(oEmbedの画像を自前のストレージへ取り込む。元のURLは期限切れになるため)。
 * Instagramは公式に画像を取る手段が無いので、アップロードが無ければnull(プレーヤー側で既定の背景を出す)。
 */
async function resolveThumb(admin: Admin, video: VideoRef, rawUrl: string, file: FormDataEntryValue | null): Promise<string | null> {
  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) throw new Error("サムネイルは画像ファイルを選んでください");
    if (file.size > MAX_THUMB_BYTES) throw new Error("サムネイル画像が大きすぎます(上限3MB)");
    const url = await uploadThumb(admin, await file.arrayBuffer(), file.type);
    if (!url) throw new Error("サムネイルのアップロードに失敗しました");
    return url;
  }
  if (video.provider === "youtube") return youtubeThumbUrl(video.ref);
  if (video.provider === "tiktok") {
    try {
      const full = await expandShortVideoUrl(rawUrl);
      const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(full)}`, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) return null;
      const json = (await res.json()) as { thumbnail_url?: string };
      if (!json.thumbnail_url) return null;
      const img = await fetch(json.thumbnail_url, { signal: AbortSignal.timeout(8000) });
      if (!img.ok) return null;
      const buf = await img.arrayBuffer();
      if (buf.byteLength === 0 || buf.byteLength > MAX_THUMB_BYTES) return null;
      return await uploadThumb(admin, buf, img.headers.get("content-type")?.split(";")[0] || "image/jpeg");
    } catch {
      return null;
    }
  }
  return null;
}

/** 運営者だけが、外部動画(YouTubeショート/TikTok/Instagramリール)をリールまたはイベントとして追加する。 */
export async function createEmbedPost(formData: FormData) {
  await requireRootAdmin();
  const admin = createAdminClient();

  const kind = String(formData.get("kind") ?? "reel");
  const shopId = String(formData.get("shop_id") ?? "").trim();
  const rawUrl = String(formData.get("video_url") ?? "").trim();
  const text = String(formData.get("text") ?? "").trim();
  if (!shopId) throw new Error("店舗を選んでください");
  if (!rawUrl) throw new Error("動画のURLを入力してください");
  const video = await parseVideoUrlWithShortLinks(rawUrl);
  if (!video) throw new Error("動画のURLを判別できません。YouTube(ショート可)・TikTok・Instagram(リール)のURLを貼ってください");

  const { data: shop } = await admin.from("locapass_shops").select("id, portal_id, name").eq("id", shopId).maybeSingle();
  if (!shop) throw new Error("店舗が見つかりません");

  const thumb = await resolveThumb(admin, video, rawUrl, formData.get("thumb"));

  if (kind === "event") {
    const title = String(formData.get("title") ?? "").trim();
    if (!title) throw new Error("イベントのタイトルを入力してください");
    if (!thumb) throw new Error("このURLはサムネイルを自動で取れません。サムネイル画像をアップロードしてください(イベントには画像が必要です)");
    const startDate = String(formData.get("start_date") ?? "").trim();
    const endDate = String(formData.get("end_date") ?? "").trim();
    // 日付は日本時間。開始は0:00、終了は23:45(店舗側のイベント登録と同じ)。
    const startsAt = startDate ? new Date(`${startDate}T00:00:00+09:00`).toISOString() : null;
    const endsAt = endDate ? new Date(`${endDate}T23:45:00+09:00`).toISOString() : null;
    if (startsAt && endsAt && endsAt < startsAt) throw new Error("終了日は開始日より後にしてください");
    const { error } = await (admin as any).from("locapass_shop_events").insert({
      shop_id: shop.id,
      title,
      body: text || null,
      starts_at: startsAt,
      ends_at: endsAt,
      image_url: thumb,
      gallery_image_urls: [],
      embed_provider: video.provider,
      embed_ref: video.ref,
    });
    if (error) throw new Error(`イベントの保存に失敗しました: ${error.message}`);
    revalidatePath("/events");
  } else {
    const { error } = await (admin as any).from("locapass_reels").insert({
      shop_id: shop.id,
      portal_id: shop.portal_id,
      caption: text || null,
      images: [],
      poster_url: thumb,
      reel_type: "permanent",
      status: "publish",
      published_at: new Date().toISOString(),
      embed_provider: video.provider,
      embed_ref: video.ref,
    });
    if (error) throw new Error(`リールの保存に失敗しました: ${error.message}`);
    revalidatePath("/");
  }
  revalidatePath("/admin/embeds");
}

export async function deleteEmbedPost(kind: "reel" | "event", id: string) {
  await requireRootAdmin();
  const admin = createAdminClient();
  const table = kind === "event" ? "locapass_shop_events" : "locapass_reels";
  // 外部動画の行だけを消す(通常の投稿を誤って消さない)。0件でもエラーにならないので.select()で確認する。
  const { data, error } = await (admin as any).from(table).delete().eq("id", id).not("embed_provider", "is", null).select("id");
  if (error) throw new Error(`削除に失敗しました: ${error.message}`);
  if (!data?.length) throw new Error("削除できませんでした(対象が見つかりません)");
  revalidatePath("/admin/embeds");
  revalidatePath("/");
  revalidatePath("/events");
}

/** 追加済みの外部動画のサムネイル画像を、後から差し替える。 */
export async function updateEmbedThumb(kind: "reel" | "event", id: string, formData: FormData) {
  await requireRootAdmin();
  const admin = createAdminClient();
  const file = formData.get("thumb");
  if (!(file instanceof File) || file.size === 0) throw new Error("画像を選んでください");
  if (!file.type.startsWith("image/")) throw new Error("サムネイルは画像ファイルを選んでください");
  if (file.size > MAX_THUMB_BYTES) throw new Error("サムネイル画像が大きすぎます(上限3MB)");
  const url = await uploadThumb(admin, await file.arrayBuffer(), file.type);
  if (!url) throw new Error("サムネイルのアップロードに失敗しました");
  // 外部動画の行だけを更新する。0件でもエラーにならないので.select()で確認する。
  const { data, error } =
    kind === "event"
      ? await (admin as any).from("locapass_shop_events").update({ image_url: url }).eq("id", id).not("embed_provider", "is", null).select("id")
      : await (admin as any).from("locapass_reels").update({ poster_url: url }).eq("id", id).not("embed_provider", "is", null).select("id");
  if (error) throw new Error(`保存に失敗しました: ${error.message}`);
  if (!data?.length) throw new Error("保存できませんでした(対象が見つかりません)");
  revalidatePath("/admin/embeds");
  revalidatePath("/");
  revalidatePath("/events");
}
