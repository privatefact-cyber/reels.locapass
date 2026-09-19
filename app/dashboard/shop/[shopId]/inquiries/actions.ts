"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** お問い合わせへの返信(本家 app/dashboard/inquiries/actions.ts)。locapass_shop_inquiry_messages に書く。 */
export async function replyToInquiry(shopId: string, inquiryId: string, formData: FormData) {
  const body = String(formData.get("body") ?? "").trim();
  if (!body) throw new Error("返信内容は必須です");

  const supabase = await createClient();
  // 対象の問い合わせがこの店舗のものか確認する(RLSでも他店舗の問い合わせには書き込めない)。
  const { data: inquiry } = await supabase
    .from("locapass_shop_inquiries")
    .select("id")
    .eq("id", inquiryId)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (!inquiry) throw new Error("お問い合わせが見つかりません");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("locapass_shop_inquiry_messages").insert({
    inquiry_id: inquiryId,
    sender_type: "shop",
    shop_admin_user_id: user?.id ?? null,
    body,
  });
  if (error) throw new Error(`返信の送信に失敗しました: ${error.message}`);
  revalidatePath(`/dashboard/shop/${shopId}/inquiries/${inquiryId}`);
  revalidatePath(`/dashboard/shop/${shopId}/inquiries`);
}
