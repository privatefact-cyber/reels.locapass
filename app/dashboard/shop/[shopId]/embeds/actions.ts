"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createEmbedPostForShop } from "@/lib/embed-post/createEmbedPost";
import { isPaidPlan } from "@/lib/recommend/slot";

/**
 * 外部動画の追加。有料プラン(free以外)の店舗か、オプション(embed_enabled)を契約した店舗の管理者だけが、自分の店舗に追加できる。
 * 契約のオン/オフは運営者だけが変更できる(DBのトリガーで保護)。
 */
export async function addShopEmbed(shopId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ログインが必要です");
  const { data: canManage } = await supabase.rpc("locapass_is_shop_admin", { p_shop_id: shopId });
  if (!canManage) throw new Error("この店舗を編集する権限がありません");

  // 契約の確認は、店舗が書き換えられない値を、運営側の権限で読んで行う。
  const admin = createAdminClient();
  const { data: opt } = await (admin as any).from("locapass_shops").select("embed_enabled, plan").eq("id", shopId).maybeSingle();
  // 運営者(ポータル管理者以上)は、契約の有無に関わらず追加できる。
  const { data: shopPortal } = await (admin as any).from("locapass_shops").select("portal_id").eq("id", shopId).maybeSingle();
  const { data: isOperator } = shopPortal?.portal_id
    ? await supabase.rpc("locapass_is_portal_admin", { p_portal_id: shopPortal.portal_id })
    : { data: false };
  // 有料プラン(free以外)の店舗は、オプション契約なしで追加できる。
  if (!opt?.embed_enabled && !isPaidPlan(opt?.plan) && !isOperator) throw new Error("外部動画の追加は、有料プランまたはオプションの契約が必要です");

  await createEmbedPostForShop(admin, shopId, formData);
  revalidatePath(`/dashboard/shop/${shopId}/posts`);
  revalidatePath("/");
  revalidatePath("/events");
}
