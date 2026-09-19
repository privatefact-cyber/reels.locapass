"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * お気に入りユーザーへのメッセージ(本家 app/dashboard/messages/actions.ts)。
 * 本家は service role で notifications に直接書き込むが、locapass では権限確認(shop_admin 以上)・
 * 「そのユーザーが本当にこの店舗をお気に入り登録しているか」の確認・書き込みを
 * DB関数 locapass_send_shop_message にまとめている。
 */
export async function sendShopMessage(shopId: string, formData: FormData) {
  const body = String(formData.get("body") ?? "").trim();
  const targetUserId = String(formData.get("target_user_id") ?? "").trim() || null;
  if (!body) throw new Error("本文を入力してください");

  const supabase = await createClient();
  const { error } = await supabase.rpc("locapass_send_shop_message", {
    p_shop_id: shopId,
    p_body: body,
    p_target_user_id: targetUserId ?? undefined,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/dashboard/shop/${shopId}/messages`);
}
