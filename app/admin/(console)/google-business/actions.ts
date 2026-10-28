"use server";

import { revalidatePath } from "next/cache";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { syncShopToGbp } from "@/lib/gbp/sync";
import { fetchReviewsForShop } from "@/lib/gbp/reviews";
import { sendShopPhotos } from "@/lib/gbp/photos";
import { postToGoogle } from "@/lib/gbp/posts";

const PATH = "/admin/google-business";

/** 「locations/123…」または数字だけを受け付け、「locations/数字」に統一する */
function normalizeLocationId(raw: string): string {
  const v = raw.trim().replace(/^locations\//, "");
  if (!/^\d{6,}$/.test(v)) throw new Error("ロケーションIDは数字(例: 1234567890123456789)で入力してください");
  return `locations/${v}`;
}

export async function addGbpLink(formData: FormData) {
  await requireRootAdmin();
  const shopId = String(formData.get("shopId") ?? "");
  if (!shopId) throw new Error("店舗を選んでください");
  const locationId = normalizeLocationId(String(formData.get("locationId") ?? ""));

  const supabase = (await createClient()) as any;
  const { data, error } = await supabase
    .from("locapass_gbp_links")
    .insert({ shop_id: shopId, gbp_location_id: locationId })
    .select("shop_id");
  if (error) throw new Error(`追加に失敗しました: ${error.message}`);
  // RLSで0件になってもエラーにならないため、件数で確認する
  if (!data?.length) throw new Error("追加できませんでした(権限を確認してください)");
  revalidatePath(PATH);
}

export async function updateGbpLink(formData: FormData) {
  const admin = await requireRootAdmin();
  const shopId = String(formData.get("shopId") ?? "");
  const supabase = (await createClient()) as any;

  const { data: current } = await supabase.from("locapass_gbp_links").select("photos_consent_at").eq("shop_id", shopId).maybeSingle();
  if (!current) throw new Error("連携が見つかりません");

  const patch: Record<string, unknown> = {
    enabled: formData.get("enabled") === "on",
    sync_hours: formData.get("sync_hours") === "on",
    sync_phone: formData.get("sync_phone") === "on",
    sync_description: formData.get("sync_description") === "on",
    sync_reviews: formData.get("sync_reviews") === "on",
    sync_name: formData.get("sync_name") === "on",
    sync_address: formData.get("sync_address") === "on",
    updated_at: new Date().toISOString(),
  };

  // 写真の自動送信は、店舗の同意を得たと記録した場合だけオンにできる(同意の日時・記録した人・取り方を残す)
  const consent = formData.get("photos_consent") === "on";
  const note = String(formData.get("photos_consent_note") ?? "").trim().slice(0, 300);
  if (consent) {
    if (!note) throw new Error("写真の同意は、どう確認したか(例: 2026-11-01 LINEで確認)を入力してください");
    patch.photos_consent_note = note;
    if (!current.photos_consent_at) {
      patch.photos_consent_at = new Date().toISOString();
      patch.photos_consent_by = admin.id;
    }
    patch.sync_photos = formData.get("sync_photos") === "on";
  } else {
    patch.photos_consent_at = null;
    patch.photos_consent_by = null;
    patch.photos_consent_note = null;
    patch.sync_photos = false;
  }

  const locRaw = String(formData.get("locationId") ?? "").trim();
  if (locRaw) patch.gbp_location_id = normalizeLocationId(locRaw);

  const { data, error } = await supabase.from("locapass_gbp_links").update(patch).eq("shop_id", shopId).select("shop_id");
  if (error) throw new Error(`保存に失敗しました: ${error.message}`);
  if (!data?.length) throw new Error("保存できませんでした(権限を確認してください)");
  revalidatePath(PATH);
}

export async function removeGbpLink(formData: FormData) {
  await requireRootAdmin();
  const shopId = String(formData.get("shopId") ?? "");
  const supabase = (await createClient()) as any;
  const { data, error } = await supabase.from("locapass_gbp_links").delete().eq("shop_id", shopId).select("shop_id");
  if (error) throw new Error(`解除に失敗しました: ${error.message}`);
  if (!data?.length) throw new Error("解除できませんでした(権限を確認してください)");
  revalidatePath(PATH);
}

export async function syncGbpNow(formData: FormData) {
  await requireRootAdmin();
  const shopId = String(formData.get("shopId") ?? "");
  const supabase = (await createClient()) as any;
  await syncShopToGbp(supabase, shopId);
  revalidatePath(PATH);
}

export async function fetchGbpReviewsNow(formData: FormData) {
  await requireRootAdmin();
  await fetchReviewsForShop(String(formData.get("shopId") ?? ""));
  revalidatePath(PATH);
}

export async function sendGbpPhotosNow(formData: FormData) {
  await requireRootAdmin();
  await sendShopPhotos(String(formData.get("shopId") ?? ""));
  revalidatePath(PATH);
}

export async function postGbpNow(formData: FormData) {
  const admin = await requireRootAdmin();
  const result = await postToGoogle(String(formData.get("shopId") ?? ""), admin.id, {
    summary: String(formData.get("summary") ?? ""),
    linkUrl: String(formData.get("linkUrl") ?? ""),
    photoUrl: String(formData.get("photoUrl") ?? ""),
  });
  revalidatePath(PATH);
  if (result.status === "error") throw new Error(result.message ?? "投稿に失敗しました");
}
