"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { translateAddressToEnglish } from "@/lib/map/translateAddress";
import { needsTranslation, translateFields } from "@/lib/i18n/contentTranslation";
import type { Json } from "@/types/supabase";

/**
 * LUXELA本家(app/dashboard/shop/actions.ts)の店舗情報画面をlocapass_shopsにつないだ版。
 * エリア・SNS・LINE QR・トップ画像/動画・利用説明は00082で追加した列に保存する(列名は本家と同じ)。
 */

/** 管理コンソールにログイン中で、かつこの店舗のサイトを担当していることを確認する。 */
async function requireShopAccess(shopId: string) {
  const scope = await requireAdmin();
  const supabase = await createClient();
  const { data: shop } = await supabase
    .from("locapass_shops")
    .select("id, site_id")
    .eq("id", shopId)
    .maybeSingle();
  if (!shop) throw new Error("店舗が見つかりません");
  if (scope.siteIds !== null && !scope.siteIds.includes(shop.site_id)) {
    throw new Error("この店舗を編集する権限がありません");
  }
  return supabase;
}

function revalidateShop(shopId: string) {
  revalidatePath(`/admin/locapass-shops/${shopId}`);
  revalidatePath(`/shops/${shopId}`);
  revalidatePath("/admin");
}

export async function updateShopProfile(shopId: string, formData: FormData) {
  const supabase = await requireShopAccess(shopId);

  const name = String(formData.get("name") ?? "").trim();
  const genre = String(formData.get("genre") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const businessHours = String(formData.get("business_hours") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const coverImageUrl = String(formData.get("cover_image_url") ?? "").trim();
  const websiteUrl = String(formData.get("website_url") ?? "").trim();
  const lineUrl = String(formData.get("line_url") ?? "").trim();
  const area = String(formData.get("area") ?? "").trim();
  const snsX = String(formData.get("sns_x") ?? "").trim();
  const snsInstagram = String(formData.get("sns_instagram") ?? "").trim();
  const snsLine = String(formData.get("sns_line") ?? "").trim();
  const lineQrImageUrl = String(formData.get("line_qr_image_url") ?? "").trim();
  const heroMediaUrl = String(formData.get("hero_media_url") ?? "").trim();
  const heroMediaType = String(formData.get("hero_media_url_type") ?? "").trim() === "video" ? "video" : "image";
  const usageNotes = String(formData.get("usage_notes") ?? "").trim();

  if (!name) throw new Error("店舗名は必須です");

  // 住所が変わったら英語表記を裏で作り直す(本家shops.address_enと同じ方式)。
  // 翻訳が落ちても店舗情報の保存自体は通す。
  const { data: currentShop } = await supabase
    .from("locapass_shops")
    .select("address, address_en, tagline, translations")
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
  const translationFields = {
    description,
    tagline: currentShop?.tagline ?? null,
    business_hours: businessHours,
  };
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
      category: genre || null,
      address: address || null,
      ...addressEnPatch,
      tel: phone || null,
      business_hours: businessHours,
      description,
      cover_url: coverImageUrl || null,
      url: websiteUrl || null,
      line_url: lineUrl || null,
      area: area || null,
      sns_links: {
        ...(snsX ? { x: snsX } : {}),
        ...(snsInstagram ? { instagram: snsInstagram } : {}),
        ...(snsLine ? { line: snsLine } : {}),
      },
      line_qr_image_url: lineQrImageUrl || null,
      hero_media_url: heroMediaUrl || null,
      ...(heroMediaUrl ? { hero_media_type: heroMediaType } : {}),
      usage_notes: usageNotes || null,
      ...translationsPatch,
    })
    .eq("id", shopId)
    .select("id");

  if (error) throw new Error(`店舗情報の更新に失敗しました: ${error.message}`);
  // RLSにより対象行が0件のまま「成功扱い」で返ってくるケースを検知する。
  if (!data || data.length === 0) {
    throw new Error("店舗情報の更新に失敗しました(対象の店舗が見つからないか、権限がありません)");
  }

  revalidateShop(shopId);
}

/** マップのピン位置を保存する(locapass_shopsのlat/lng)。 */
export async function updateShopPin(shopId: string, lat: number, lng: number) {
  let supabase;
  try {
    supabase = await requireShopAccess(shopId);
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "権限がありません" };
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { ok: false as const, error: "座標が不正です" };
  }

  const { data, error } = await supabase
    .from("locapass_shops")
    .update({ lat, lng })
    .eq("id", shopId)
    .select("id");

  if (error) return { ok: false as const, error: error.message };
  if (!data?.length) return { ok: false as const, error: "更新できませんでした(権限をご確認ください)" };

  revalidateShop(shopId);
  revalidatePath("/map");
  return { ok: true as const };
}

const MAX_GALLERY_IMAGES = 10;

/** 店舗紹介ギャラリーに1枚追加する(アップロード自体はクライアント側でstorageに直接行い、URLだけここで登録する)。 */
export async function addGalleryImage(shopId: string, url: string) {
  const supabase = await requireShopAccess(shopId);
  if (!url) throw new Error("画像URLがありません");

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

  revalidateShop(shopId);
}

export async function deleteGalleryImage(shopId: string, url: string) {
  const supabase = await requireShopAccess(shopId);

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

  revalidateShop(shopId);
}

/** 店舗のリール(locapass_reels)を削除する。 */
export async function deleteReel(shopId: string, reelId: string) {
  const supabase = await requireShopAccess(shopId);
  const { data, error } = await supabase
    .from("locapass_reels")
    .delete()
    .eq("id", reelId)
    .eq("shop_id", shopId)
    .select("id");

  if (error || !data || data.length === 0) {
    throw new Error(`削除に失敗しました: ${error?.message ?? "対象が見つかりません"}`);
  }

  revalidatePath(`/admin/locapass-shops/${shopId}/reels`);
  revalidatePath("/");
}
