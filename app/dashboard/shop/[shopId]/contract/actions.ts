"use server";

import { revalidatePath } from "next/cache";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import { createClient } from "@/lib/supabase/server";
import { billingDb } from "@/lib/billing/db";

// 掲載プランの契約(WEB上の同意)。価格・割引はDB側がプラン表から決めて契約に写す(画面から金額は受け取らない)。
export async function agreeContract(shopId: string, formData: FormData) {
  const viewer = await getShopForManager(shopId);
  if (!viewer) throw new Error("権限がありません");
  if (formData.get("agree") !== "on") throw new Error("契約内容に同意する場合は、チェックを入れてください");

  const planCode = String(formData.get("plan_code") ?? "");
  const termsId = String(formData.get("terms_id") ?? "");
  const promoId = String(formData.get("promo_id") ?? "");
  if (!planCode || !termsId) throw new Error("プランを選んでください");

  const { error } = await billingDb(await createClient()).rpc("locapass_agree_contract", {
    p_shop_id: shopId,
    p_plan_code: planCode,
    p_terms_id: termsId,
    p_promo_id: promoId || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/shop/${shopId}/contract`);
}
