"use server";

import { revalidatePath } from "next/cache";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { syncShopToGbp } from "@/lib/gbp/sync";

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
  await requireRootAdmin();
  const shopId = String(formData.get("shopId") ?? "");
  const patch: Record<string, unknown> = {
    enabled: formData.get("enabled") === "on",
    sync_hours: formData.get("sync_hours") === "on",
    sync_phone: formData.get("sync_phone") === "on",
    sync_description: formData.get("sync_description") === "on",
    updated_at: new Date().toISOString(),
  };
  const locRaw = String(formData.get("locationId") ?? "").trim();
  if (locRaw) patch.gbp_location_id = normalizeLocationId(locRaw);

  const supabase = (await createClient()) as any;
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
