"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { translateAddressToEnglish } from "@/lib/map/translateAddress";
import { needsTranslation, translateFields } from "@/lib/i18n/contentTranslation";
import type { Json } from "@/types/supabase";

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
  const tagline = String(formData.get("tagline") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const businessHours = String(formData.get("business_hours") ?? "").trim() || null;

  const supabase = await createClient();

  // 住所が変わったら英語表記を裏で作り直す(luxela本家のshops.address_enと同じ方式)。
  // 店舗担当者には日本語住所だけを入力してもらい、address_enは自動生成する。
  // 翻訳が落ちても店舗情報の保存自体は通す。
  const { data: currentShop } = await supabase
    .from("locapass_shops")
    .select("address, address_en, description, tagline, business_hours, translations")
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

  let translationsPatch: { translations: Json } | Record<string, never> = {};
  const translationFields = { description, tagline, business_hours: businessHours };
  if (needsTranslation(translationFields, currentShop?.translations)) {
    try {
      const translations = await translateFields(translationFields);
      if (translations) translationsPatch = { translations: translations as unknown as Json };
    } catch (e) {
      console.error("店舗紹介文の翻訳に失敗しました:", e);
    }
  }

  const { data, error } = await supabase
    .from("locapass_shops")
    .update({
      name,
      category: String(formData.get("category") ?? "").trim() || null,
      tagline,
      description,
      address: address || null,
      ...addressEnPatch,
      tel: String(formData.get("tel") ?? "").trim() || null,
      business_hours: businessHours,
      url: String(formData.get("url") ?? "").trim() || null,
      line_url: String(formData.get("line_url") ?? "").trim() || null,
      cover_url: String(formData.get("cover_url") ?? "").trim() || null,
      icon_url: String(formData.get("icon_url") ?? "").trim() || null,
      ...translationsPatch,
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

const MAX_GALLERY_IMAGES = 10;

/** 店舗紹介ギャラリーに1枚追加する(アップロード自体はクライアント側でstorageに直接行い、URLだけここで登録する)。 */
export async function addLocapassGalleryImage(shopId: string, url: string) {
  await requireAdmin();
  if (!url) throw new Error("画像URLがありません");

  const supabase = await createClient();
  const { data: current, error: fetchError } = await supabase
    .from("locapass_shops")
    .select("gallery_image_urls")
    .eq("id", shopId)
    .single();
  if (fetchError) throw new Error(`ギャラリーの取得に失敗しました: ${fetchError.message}`);

  const existing = current?.gallery_image_urls ?? [];
  if (existing.length >= MAX_GALLERY_IMAGES) {
    throw new Error(`ギャラリーは最大${MAX_GALLERY_IMAGES}枚までです`);
  }

  const { error } = await supabase
    .from("locapass_shops")
    .update({ gallery_image_urls: [...existing, url] })
    .eq("id", shopId);
  if (error) throw new Error(`ギャラリーへの追加に失敗しました: ${error.message}`);

  revalidatePath(`/admin/locapass-shops/${shopId}`);
  revalidatePath(`/shops/${shopId}`);
}

export async function deleteLocapassGalleryImage(shopId: string, url: string) {
  await requireAdmin();

  const supabase = await createClient();
  const { data: current, error: fetchError } = await supabase
    .from("locapass_shops")
    .select("gallery_image_urls")
    .eq("id", shopId)
    .single();
  if (fetchError) throw new Error(`ギャラリーの取得に失敗しました: ${fetchError.message}`);

  const existing = current?.gallery_image_urls ?? [];
  const { error } = await supabase
    .from("locapass_shops")
    .update({ gallery_image_urls: existing.filter((u) => u !== url) })
    .eq("id", shopId);
  if (error) throw new Error(`ギャラリーの削除に失敗しました: ${error.message}`);

  revalidatePath(`/admin/locapass-shops/${shopId}`);
  revalidatePath(`/shops/${shopId}`);
}
