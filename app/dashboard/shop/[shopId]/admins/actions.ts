"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type AddAdminState = { ok: boolean; error?: string; email?: string; password?: string } | null;

/** DBの例外メッセージから、画面に出してよい日本語だけを取り出す。 */
function friendly(message: string): string {
  if (message.includes("forbidden")) return "この操作ができるのは、この店舗のオーナーIDだけです。";
  return message.replace(/^.*?(管理者|このメール|オーナー|パスワード)/, "$1");
}

/**
 * 管理者IDの追加(オーナー限定・1店舗5人まで)。権限と上限の判定はDB側のRPCが行う
 * (locapass_owner_add_shop_admin)。発行した初期パスワードは、この戻り値で1回だけ画面に返す。
 */
export async function addShopAdmin(shopId: string, _prev: AddAdminState, formData: FormData): Promise<AddAdminState> {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();
  // 型定義(types/supabase.ts)に未反映のRPCのため、clientごとanyにしてthisを保つ。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("locapass_owner_add_shop_admin", {
    p_shop_id: shopId,
    p_email: email || null,
    p_password: password || null,
  });
  if (error) return { ok: false, error: friendly(error.message) };
  const row = Array.isArray(data) ? data[0] : data;
  revalidatePath(`/dashboard/shop/${shopId}/admins`);
  return { ok: true, email: row?.login_email, password: row?.initial_password };
}

export async function removeShopAdmin(shopId: string, shopAdminId: string) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("locapass_owner_remove_shop_admin", { p_shop_admin_id: shopAdminId });
  if (error) throw new Error(friendly(error.message));
  revalidatePath(`/dashboard/shop/${shopId}/admins`);
}
