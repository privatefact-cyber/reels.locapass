"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * キャスト管理(LUXELA本家 app/dashboard/cast/actions.ts と同じ動き)を locapass_cast_members につないだ版。
 * 操作できるのはその店舗の shop_admin 以上(DBの locapass_is_shop_admin。RLS・RPC側でも同じ判定)。
 * 与信照会(本家の check_person_risk)は locapass に照会先が無いため行わない。本家も照会に失敗した
 * ときは照会結果なしで登録を続けるので、それと同じ扱いになる。
 */
async function requireShopAdmin(shopId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ログインが必要です");
  const { data: ok } = await supabase.rpc("locapass_is_shop_admin", { p_shop_id: shopId });
  if (!ok) throw new Error("この店舗のキャストを管理する権限がありません");
  return supabase;
}

function castPath(shopId: string, castId?: string) {
  return castId ? `/dashboard/shop/${shopId}/cast/${castId}` : `/dashboard/shop/${shopId}/cast`;
}

export async function addCast(shopId: string, formData: FormData) {
  const supabase = await requireShopAdmin(shopId);

  const name = String(formData.get("name") ?? "").trim();
  const ageRaw = String(formData.get("age") ?? "").trim();
  const prText = String(formData.get("pr_text") ?? "").trim();
  const legalName = String(formData.get("legal_name") ?? "").trim();
  const legalNameKana = String(formData.get("legal_name_kana") ?? "").trim();
  const birthDate = String(formData.get("birth_date") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  if (!name) throw new Error("氏名は必須です");

  const { data, error } = await supabase
    .from("locapass_cast_members")
    .insert({
      shop_id: shopId,
      name,
      age: ageRaw ? Number(ageRaw) : null,
      pr_text: prText || null,
      legal_name: legalName || null,
      legal_name_kana: legalNameKana || null,
      birth_date: birthDate || null,
      phone: phone || null,
      address: address || null,
    })
    .select("id")
    .single();

  if (error) throw new Error(`キャスト登録に失敗しました: ${error.message}`);

  revalidatePath(castPath(shopId));
  redirect(castPath(shopId, data.id));
}

export async function updateCastProfile(shopId: string, castId: string, formData: FormData) {
  const supabase = await requireShopAdmin(shopId);

  const name = String(formData.get("name") ?? "").trim();
  const ageRaw = String(formData.get("age") ?? "").trim();
  const prText = String(formData.get("pr_text") ?? "").trim();
  const t = String(formData.get("t") ?? "").trim();
  const b = String(formData.get("b") ?? "").trim();
  const w = String(formData.get("w") ?? "").trim();
  const h = String(formData.get("h") ?? "").trim();
  const legalName = String(formData.get("legal_name") ?? "").trim();
  const legalNameKana = String(formData.get("legal_name_kana") ?? "").trim();
  const birthDate = String(formData.get("birth_date") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  if (!name) throw new Error("氏名は必須です");

  const { data, error } = await supabase
    .from("locapass_cast_members")
    .update({
      name,
      age: ageRaw ? Number(ageRaw) : null,
      pr_text: prText || null,
      sizes: { t, b, w, h },
      legal_name: legalName || null,
      legal_name_kana: legalNameKana || null,
      birth_date: birthDate || null,
      phone: phone || null,
      address: address || null,
    })
    .eq("id", castId)
    .eq("shop_id", shopId)
    .select("id");

  if (error) throw new Error(`更新に失敗しました: ${error.message}`);
  if (!data || data.length === 0) throw new Error("更新に失敗しました(対象が見つからないか、権限がありません)");
  revalidatePath(castPath(shopId, castId));
}

export type InviteCastState =
  | { status: "idle" }
  | { status: "success"; loginEmail: string; initialPassword: string }
  | { status: "error"; message: string };

export async function inviteCast(shopId: string, castId: string, _prevState: InviteCastState): Promise<InviteCastState> {
  let supabase;
  try {
    supabase = await requireShopAdmin(shopId);
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "権限がありません" };
  }
  const { data, error } = await supabase.rpc("locapass_create_cast_invite", { p_cast_id: castId }).single();
  if (error || !data) {
    return { status: "error", message: error?.message ?? "招待の発行に失敗しました" };
  }
  revalidatePath(castPath(shopId, castId));
  return { status: "success", loginEmail: data.login_email, initialPassword: data.initial_password };
}

/** 投稿用マイページへのマジックリンクを失効させ、新しいトークンを発行し直す(リンク漏洩時など)。 */
export async function regenerateCastLoginToken(shopId: string, castId: string) {
  const supabase = await requireShopAdmin(shopId);
  const { error } = await supabase.rpc("locapass_regenerate_cast_login_token", { p_cast_id: castId });
  if (error) throw new Error(`投稿用リンクの再発行に失敗しました: ${error.message}`);
  revalidatePath(castPath(shopId, castId));
}

/** キャストの削除(本家には無いが、shop_admin が所属キャストを削除できるという権限仕様に対応)。 */
export async function deleteCast(shopId: string, castId: string) {
  const supabase = await requireShopAdmin(shopId);
  const { data, error } = await supabase
    .from("locapass_cast_members")
    .delete()
    .eq("id", castId)
    .eq("shop_id", shopId)
    .select("id");
  if (error) throw new Error(`キャストの削除に失敗しました: ${error.message}`);
  if (!data || data.length === 0) throw new Error("キャストの削除に失敗しました(対象が見つからないか、権限がありません)");
  revalidatePath(castPath(shopId));
  redirect(castPath(shopId));
}
