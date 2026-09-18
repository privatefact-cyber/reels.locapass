"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentShop } from "@/lib/dashboard/current-shop";
import { createAdminClient } from "@/lib/supabase/admin";

// お気に入りユーザーへのDM。notificationsへの書き込みはRLSで一般ユーザー自身にしか
// 許可していないため、店舗スタッフの権限確認(requireCurrentShop)を済ませた上で
// service roleクライアントから挿入する。
export async function sendShopMessage(formData: FormData) {
  const shop = await requireCurrentShop();
  if (!shop) throw new Error("所属店舗が見つかりません");

  const body = String(formData.get("body") ?? "").trim();
  const targetUserId = String(formData.get("target_user_id") ?? "").trim() || null;
  if (!body) throw new Error("本文を入力してください");

  const supabase = createAdminClient();

  let recipientIds: string[];
  if (targetUserId) {
    // 個別送信でも「このユーザーが実際にこの店舗をお気に入り登録しているか」を必ず確認する
    // (店舗スタッフが無関係なuser_idを直接送りつけてくる不正を防ぐ)。
    const { data: fav } = await supabase
      .from("user_shop_favorites")
      .select("user_id")
      .eq("shop_id", shop.id)
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (!fav) throw new Error("お気に入り登録していないユーザーには送信できません");
    recipientIds = [targetUserId];
  } else {
    const { data: favorites } = await supabase
      .from("user_shop_favorites")
      .select("user_id")
      .eq("shop_id", shop.id);
    recipientIds = (favorites ?? []).map((f) => f.user_id);
  }

  if (recipientIds.length === 0) {
    throw new Error("送信先のお気に入りユーザーがいません");
  }

  const { error } = await supabase.from("notifications").insert(
    recipientIds.map((userId) => ({
      user_id: userId,
      type: "shop_message" as const,
      title: `${shop.name}からのメッセージ`,
      body,
      url: `/shops/${shop.id}`,
      shop_id: shop.id,
    })),
  );

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/messages");
}
