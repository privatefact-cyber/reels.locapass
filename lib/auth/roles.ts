import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

/** DBの locapass_my_roles() の戻り値。判定はすべてDB側(権限テーブル)で行う。 */
export type MyRoles = {
  super_admin: boolean;
  portal_ids: number[];
  shop_admin_shop_ids: string[];
  staff: { staff_member_id: string; shop_id: string } | null;
  cast: { cast_id: string; shop_id: string } | null;
  member: boolean;
};

export async function fetchMyRoles(supabase: SupabaseClient<Database>): Promise<MyRoles | null> {
  const { data, error } = await supabase.rpc("locapass_my_roles");
  if (error || !data) return null;
  return data as unknown as MyRoles;
}

/**
 * ログイン後の行き先。権限が複数あるときは上位を優先する。
 *   super_admin → /admin(最上位のポータル発行・管理)
 *   portal_admin → /admin(担当ポータル配下の店舗管理)
 *   shop_admin → /dashboard/shop/[shopId](複数店舗なら /dashboard/shop の選択画面)
 *   staff → /dashboard/staff
 *   cast  → /dashboard/cast
 *   user(一般会員・権限なし) → /mypage
 */
export function homePathForRoles(roles: MyRoles | null): string {
  if (!roles) return "/mypage";
  if (roles.super_admin) return "/admin";
  if (roles.portal_ids.length > 0) return "/admin";
  if (roles.shop_admin_shop_ids.length === 1) return `/dashboard/shop/${roles.shop_admin_shop_ids[0]}`;
  if (roles.shop_admin_shop_ids.length > 1) return "/dashboard/shop";
  if (roles.staff) return "/dashboard/staff";
  if (roles.cast) return "/dashboard/cast";
  return "/mypage";
}
