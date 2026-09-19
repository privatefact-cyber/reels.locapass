"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * スタッフ管理(LUXELA本家 app/dashboard/staff/actions.ts と同じ動き)を locapass_shop_staff_members につないだ版。
 * 操作できるのはその店舗の shop_admin 以上(DBの locapass_is_shop_admin。RLS・RPC側でも同じ判定)。
 */
async function requireShopAdmin(shopId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ログインが必要です");
  const { data: ok } = await supabase.rpc("locapass_is_shop_admin", { p_shop_id: shopId });
  if (!ok) throw new Error("この店舗のスタッフを管理する権限がありません");
  return supabase;
}

export async function addStaffMember(shopId: string, formData: FormData) {
  const supabase = await requireShopAdmin(shopId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("名前は必須です");

  const { error } = await supabase.from("locapass_shop_staff_members").insert({ shop_id: shopId, name });
  if (error) throw new Error(`スタッフの追加に失敗しました: ${error.message}`);
  revalidatePath(`/dashboard/shop/${shopId}/staff`);
}

export async function deleteStaffMember(shopId: string, staffMemberId: string) {
  const supabase = await requireShopAdmin(shopId);
  const { data, error } = await supabase
    .from("locapass_shop_staff_members")
    .delete()
    .eq("id", staffMemberId)
    .eq("shop_id", shopId)
    .select("id");
  if (error) throw new Error(`スタッフの削除に失敗しました: ${error.message}`);
  if (!data || data.length === 0) throw new Error("スタッフの削除に失敗しました(対象が見つからないか、権限がありません)");
  revalidatePath(`/dashboard/shop/${shopId}/staff`);
}

export type InviteStaffState =
  | { status: "idle" }
  | { status: "success"; loginEmail: string; initialPassword: string }
  | { status: "error"; message: string };

export async function inviteStaff(
  shopId: string,
  staffMemberId: string,
  _prevState: InviteStaffState,
): Promise<InviteStaffState> {
  let supabase;
  try {
    supabase = await requireShopAdmin(shopId);
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "権限がありません" };
  }
  const { data, error } = await supabase
    .rpc("locapass_create_staff_invite", { p_staff_member_id: staffMemberId })
    .single();
  if (error || !data) {
    return { status: "error", message: error?.message ?? "ログインの発行に失敗しました" };
  }
  revalidatePath(`/dashboard/shop/${shopId}/staff`);
  return { status: "success", loginEmail: data.login_email, initialPassword: data.initial_password };
}

/** マイページへのマジックリンクを失効させ、新しいトークンを発行し直す(リンク漏洩時など)。 */
export async function regenerateStaffLoginToken(shopId: string, staffMemberId: string) {
  const supabase = await requireShopAdmin(shopId);
  const { error } = await supabase.rpc("locapass_regenerate_staff_login_token", {
    p_staff_member_id: staffMemberId,
  });
  if (error) throw new Error(`リンクの再発行に失敗しました: ${error.message}`);
  revalidatePath(`/dashboard/shop/${shopId}/staff`);
}
