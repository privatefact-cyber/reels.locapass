"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { translateAddressToEnglish } from "@/lib/map/translateAddress";

export type UpdateShopState = { status: "idle" } | { status: "error"; message: string } | { status: "success" };

/**
 * locapass_shopsの編集可能フィールドを更新する。site管理者は自分のsite_idの
 * 店舗のみ(RLSのlocapass_is_shop_owner→locapass_is_site_admin経由で二重に制限)。
 */
export async function updateLocapassShop(
  shopId: string,
  _prevState: UpdateShopState,
  formData: FormData,
): Promise<UpdateShopState> {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { status: "error", message: "店舗名は必須です" };
  }

  const address = String(formData.get("address") ?? "").trim();

  const supabase = await createClient();

  // 住所が変わったら英語表記を裏で作り直す(luxela本家のshops.address_enと同じ方式)。
  // 店舗担当者には日本語住所だけを入力してもらい、address_enは自動生成する。
  // 翻訳が落ちても店舗情報の保存自体は通す。
  const { data: currentShop } = await supabase
    .from("locapass_shops")
    .select("address, address_en")
    .eq("id", shopId)
    .maybeSingle();

  let addressEnPatch: { address_en: string | null } | Record<string, never> = {};
  if (!address) {
    addressEnPatch = { address_en: null };
  } else if (address !== (currentShop?.address ?? "") || !currentShop?.address_en) {
    try {
      const translated = await translateAddressToEnglish(address);
      if (translated) addressEnPatch = { address_en: translated };
    } catch (e) {
      console.error("住所の英語表記の生成に失敗しました:", e);
    }
  }

  const { data, error } = await supabase
    .from("locapass_shops")
    .update({
      name,
      category: String(formData.get("category") ?? "").trim() || null,
      tagline: String(formData.get("tagline") ?? "").trim() || null,
      description: String(formData.get("description") ?? "").trim() || null,
      address: address || null,
      ...addressEnPatch,
      tel: String(formData.get("tel") ?? "").trim() || null,
      business_hours: String(formData.get("business_hours") ?? "").trim() || null,
      url: String(formData.get("url") ?? "").trim() || null,
      line_url: String(formData.get("line_url") ?? "").trim() || null,
      cover_url: String(formData.get("cover_url") ?? "").trim() || null,
      icon_url: String(formData.get("icon_url") ?? "").trim() || null,
    })
    .eq("id", shopId)
    .select("id");

  if (error) {
    return { status: "error", message: `更新に失敗しました: ${error.message}` };
  }
  if (!data || data.length === 0) {
    return { status: "error", message: "更新に失敗しました(対象の店舗が見つからないか、権限がありません)" };
  }

  revalidatePath(`/admin/locapass-shops/${shopId}`);
  revalidatePath("/admin");
  return { status: "success" };
}
