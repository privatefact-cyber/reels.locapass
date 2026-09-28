import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ShopManagerView = {
  shop: { id: string; name: string; portal_id: number };
  /** super_admin / portal_admin として開いている(店舗本人ではない)なら true。代理閲覧バナーの出し分けに使う。 */
  isOperator: boolean;
  /**
   * 店舗本人(shop_admin)として開いていて、かつ復旧用情報(電話番号・生年月日・PIN)が
   * 未登録なら true。ダッシュボードで登録必須のゲートを出す判定に使う
   * (代理閲覧中のisOperatorでは出さない)。
   */
  needsRecoverySetup: boolean;
};

/**
 * 店舗管理画面(/dashboard/shop/[shopId]配下)を開いてよいかを判定し、対象店舗を返す。
 * 入れるのは super_admin・その店舗のポータルの portal_admin・その店舗の shop_admin
 * (DBの locapass_is_shop_admin と同じ判定)。LUXELA本家の requireCurrentShop() に相当する。
 * 未ログインなら店舗ログインへ、権限が無ければ null(呼び出し側で404)。
 * layoutと各pageで同じ判定をするため、1リクエスト内ではcacheで1回に抑える。
 */
export const getShopForManager = cache(async (shopId: string): Promise<ShopManagerView | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/dashboard/shop/${shopId}`)}`);
  }

  const { data: canManage } = await supabase.rpc("locapass_is_shop_admin", { p_shop_id: shopId });
  if (!canManage) return null;

  const { data: shop } = await supabase
    .from("locapass_shops")
    .select("id, name, portal_id")
    .eq("id", shopId)
    .maybeSingle();
  if (!shop) return null;

  const { data: isOperator } = await supabase.rpc("locapass_is_portal_admin", { p_portal_id: shop.portal_id });
  // locapass_shop_admin_needs_recovery_setup はDBには存在するが、生成済みのtypes/supabase.tsが
  // 巨大すぎて自動編集ツールがタイムアウトするため型定義への追記を見送っている。ここだけ型を緩める。
  const { data: needsRecoverySetup } = isOperator
    ? { data: false }
    : await (supabase.rpc as unknown as (fn: "locapass_shop_admin_needs_recovery_setup") => Promise<{ data: boolean | null }>)(
        "locapass_shop_admin_needs_recovery_setup",
      );
  return { shop, isOperator: !!isOperator, needsRecoverySetup: !!needsRecoverySetup };
});
