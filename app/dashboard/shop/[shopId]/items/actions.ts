"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { refreshItemTranslations } from "@/lib/shop/itemTranslations";
import { ITEM_STATUSES, type ItemStatus, type VehicleAttributes } from "@/lib/shop/items";

/**
 * 店舗の掲載アイテム(車両の在庫)の登録・更新・削除。RLS(locapass_is_shop_admin)でも同じ条件で制限される。
 * UPDATE/DELETEは対象0件でもエラーにならないため、必ず .select() で件数を確認する。
 */

export type ItemInput = {
  title: string;
  price: number | null;
  priceLabel: string;
  status: ItemStatus;
  description: string;
  imageUrls: string[];
  year: string;
  mileageKm: number | null;
  inspection: string;
  color: string;
  /** 車検証から読み取った項目(任意) */
  modelCode: string;
  vin: string;
  displacementCc: number | null;
  fuel: string;
  seats: number | null;
  bodyType: string;
};

async function requireShopAccess(shopId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ログインが必要です");
  const { data: canManage } = await supabase.rpc("locapass_is_shop_admin", { p_shop_id: shopId });
  if (!canManage) throw new Error("この店舗を編集する権限がありません");
  return supabase as any;
}

function normalize(input: ItemInput) {
  const title = input.title.trim();
  if (!title) throw new Error("車名(タイトル)は必須です");
  if (title.length > 80) throw new Error("車名は80文字以内にしてください");
  if (!ITEM_STATUSES.includes(input.status)) throw new Error("状態が正しくありません");
  if (input.price != null && (!Number.isFinite(input.price) || input.price < 0)) throw new Error("価格が正しくありません");
  const priceLabel = input.priceLabel.trim();
  if (priceLabel.length > 20) throw new Error("価格の表記は20文字以内にしてください");
  const description = input.description.trim();
  if (description.length > 1000) throw new Error("説明は1000文字以内にしてください");
  const imageUrls = input.imageUrls.filter((u) => typeof u === "string" && /^https?:\/\//.test(u)).slice(0, 12);

  const attributes: VehicleAttributes = {};
  if (input.year.trim()) attributes.year = input.year.trim().slice(0, 20);
  if (input.mileageKm != null && Number.isFinite(input.mileageKm) && input.mileageKm >= 0) attributes.mileage_km = Math.round(input.mileageKm);
  if (input.inspection.trim()) attributes.inspection = input.inspection.trim().slice(0, 30);
  if (input.color.trim()) attributes.color = input.color.trim().slice(0, 30);
  if (input.modelCode.trim()) attributes.model_code = input.modelCode.trim().slice(0, 30);
  if (input.vin.trim()) attributes.vin = input.vin.trim().toUpperCase().slice(0, 30);
  if (input.displacementCc != null && Number.isFinite(input.displacementCc) && input.displacementCc > 0) attributes.displacement_cc = Math.round(input.displacementCc);
  if (input.fuel.trim()) attributes.fuel = input.fuel.trim().slice(0, 20);
  if (input.seats != null && Number.isInteger(input.seats) && input.seats > 0 && input.seats < 100) attributes.seats = input.seats;
  if (input.bodyType.trim()) attributes.body_type = input.bodyType.trim().slice(0, 20);

  return {
    title,
    price: input.price,
    price_label: priceLabel || null,
    status: input.status,
    description: description || null,
    image_urls: imageUrls,
    attributes,
    updated_at: new Date().toISOString(),
  };
}

async function revalidateShopPages(supabase: any, shopId: string) {
  revalidatePath(`/dashboard/shop/${shopId}/items`);
  const { data: shop } = await supabase.from("locapass_shops").select("slug, locapass_portals ( slug )").eq("id", shopId).maybeSingle();
  const portalSlug = shop?.locapass_portals?.slug;
  if (shop?.slug && portalSlug) {
    revalidatePath(`/${portalSlug}/shops/${shop.slug}`);
    revalidatePath(`/${portalSlug}/shops/${shop.slug}/items`, "layout");
  }
}

export async function saveItem(shopId: string, itemId: string | null, input: ItemInput) {
  const supabase = await requireShopAccess(shopId);
  const values = normalize(input);

  if (itemId) {
    const { data, error } = await supabase.from("locapass_shop_items").update(values).eq("id", itemId).eq("shop_id", shopId).select("id");
    if (error) throw new Error(`保存に失敗しました: ${error.message}`);
    if (!data || data.length === 0) throw new Error("保存に失敗しました(対象が見つからないか、権限がありません)");
    await refreshItemTranslations(supabase, itemId);
  } else {
    // 新しい車両は一覧の先頭に出す(display_orderの最小値より小さくする)。
    const { data: first } = await supabase
      .from("locapass_shop_items")
      .select("display_order")
      .eq("shop_id", shopId)
      .order("display_order", { ascending: true })
      .limit(1);
    const order = first && first.length > 0 ? (first[0].display_order as number) - 1 : 0;
    const { data: created, error } = await supabase
      .from("locapass_shop_items")
      .insert({ ...values, shop_id: shopId, kind: "vehicle", display_order: order })
      .select("id");
    if (error) throw new Error(`登録に失敗しました: ${error.message}`);
    // 英語・中国語・アラビア語の翻訳を作る。失敗しても登録は成功させ、取りこぼしは毎晩の自動処理が拾う。
    if (created?.[0]?.id) await refreshItemTranslations(supabase, created[0].id);
  }
  await revalidateShopPages(supabase, shopId);
}

export async function setItemStatus(shopId: string, itemId: string, status: ItemStatus) {
  if (!ITEM_STATUSES.includes(status)) throw new Error("状態が正しくありません");
  const supabase = await requireShopAccess(shopId);
  const { data, error } = await supabase
    .from("locapass_shop_items")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("shop_id", shopId)
    .select("id");
  if (error) throw new Error(`更新に失敗しました: ${error.message}`);
  if (!data || data.length === 0) throw new Error("更新に失敗しました(対象が見つからないか、権限がありません)");
  await revalidateShopPages(supabase, shopId);
}

export async function deleteItem(shopId: string, itemId: string) {
  const supabase = await requireShopAccess(shopId);
  const { data, error } = await supabase.from("locapass_shop_items").delete().eq("id", itemId).eq("shop_id", shopId).select("id");
  if (error) throw new Error(`削除に失敗しました: ${error.message}`);
  if (!data || data.length === 0) throw new Error("削除に失敗しました(対象が見つからないか、権限がありません)");
  await revalidateShopPages(supabase, shopId);
}
