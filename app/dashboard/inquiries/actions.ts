"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentShop } from "@/lib/dashboard/current-shop";

export async function replyToInquiry(inquiryId: string, formData: FormData) {
  const shop = await requireCurrentShop();
  if (!shop) throw new Error("所属店舗が見つかりません");

  const body = String(formData.get("body") ?? "").trim();
  if (!body) throw new Error("返信内容は必須です");

  const supabase = await createClient();
  const { error } = await supabase.from("shop_inquiry_messages").insert({
    inquiry_id: inquiryId,
    sender_type: "shop",
    body,
  });

  if (error) throw new Error(`返信の送信に失敗しました: ${error.message}`);
  revalidatePath(`/dashboard/inquiries/${inquiryId}`);
  revalidatePath("/dashboard/inquiries");
}
