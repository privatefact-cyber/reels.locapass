"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentShop } from "@/lib/dashboard/current-shop";

export async function addStaffMember(formData: FormData) {
  const shop = await requireCurrentShop();
  if (!shop) throw new Error("所属店舗が見つかりません");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("名前は必須です");

  const supabase = await createClient();
  const { error } = await supabase.from("shop_staff_members").insert({
    shop_id: shop.id,
    name,
  });

  if (error) throw new Error(`スタッフの追加に失敗しました: ${error.message}`);
  revalidatePath("/dashboard/staff");
}

export async function deleteStaffMember(staffMemberId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("shop_staff_members").delete().eq("id", staffMemberId);
  if (error) throw new Error(`スタッフの削除に失敗しました: ${error.message}`);
  revalidatePath("/dashboard/staff");
}

export type InviteStaffState =
  | { status: "idle" }
  | { status: "success"; loginEmail: string; initialPassword: string }
  | { status: "error"; message: string };

export async function inviteStaff(
  staffMemberId: string,
  _prevState: InviteStaffState,
): Promise<InviteStaffState> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_staff_invite", { p_staff_member_id: staffMemberId })
    .single();

  if (error || !data) {
    return { status: "error", message: error?.message ?? "招待の発行に失敗しました" };
  }

  revalidatePath("/dashboard/staff");
  return {
    status: "success",
    loginEmail: data.login_email,
    initialPassword: data.initial_password,
  };
}

/** マイページへのマジックリンクを失効させ、新しいトークンを発行し直す(リンク漏洩時など)。 */
export async function regenerateStaffLoginToken(staffMemberId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("regenerate_staff_login_token", {
    p_staff_member_id: staffMemberId,
  });
  if (error) throw new Error(`ログインリンクの再発行に失敗しました: ${error.message}`);
  revalidatePath("/dashboard/staff");
}
