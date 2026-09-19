import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { AdminScope } from "@/lib/admin/require-admin";

/**
 * 店舗管理画面(/admin/locapass-shops/[shopId]配下)で扱う店舗。LUXELA本家の
 * requireCurrentShop()に相当するが、ログイン主体は店舗本人ではなく運営者/サイト管理者なので
 * URLのshopIdで店舗を決め、サイト管理者は担当サイト以外の店舗には入れない。
 * layoutと各pageで同じ店舗を引くため、1リクエスト内ではcacheで1回に抑える。
 */
export const getLocapassShopForDashboard = cache(async (shopId: string, scope: AdminScope) => {
  const supabase = await createClient();
  const { data: shop } = await supabase
    .from("locapass_shops")
    .select("id, name, portal_id")
    .eq("id", shopId)
    .maybeSingle();

  if (!shop) return null;
  if (scope.portalIds !== null && !scope.portalIds.includes(shop.portal_id)) return null;
  return shop;
});
