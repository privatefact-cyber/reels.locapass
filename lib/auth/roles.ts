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

/** 管理側の画面(サイト管理・ポータル管理・店舗管理・スタッフ・パートナー)を使える立場を持っているか。 */
export function hasManagementRole(roles: MyRoles | null): boolean {
  if (!roles) return false;
  return (
    roles.super_admin ||
    roles.portal_ids.length > 0 ||
    roles.shop_admin_shop_ids.length > 0 ||
    roles.staff !== null ||
    roles.cast !== null
  );
}

/**
 * キャスト(FACES)・スタッフだけの立場か(店舗管理者・エリア管理者・ルート管理者を兼ねていない)。
 * この立場のアカウントは、一般会員向けの個人マイページ(「ゲスト」ページ)を経由せず、自分の画面へ直接入る。
 */
export function isPartnerOnly(roles: MyRoles | null): boolean {
  if (!roles) return false;
  if (roles.super_admin || roles.portal_ids.length > 0 || roles.shop_admin_shop_ids.length > 0) return false;
  return roles.staff !== null || roles.cast !== null;
}

/** ログイン後に最後に選んだ「立場」を覚えておくCookie。personal=マイページ / manage=管理側。 */
export const MODE_COOKIE = "lp_mode";

/** 立場の表示名(選択画面・ヘッダー用)。 */
export function managementLabel(roles: MyRoles): string {
  if (roles.super_admin) return "サイト管理";
  if (roles.portal_ids.length > 0) return "エリア管理";
  if (roles.shop_admin_shop_ids.length > 0) return "店舗管理";
  if (roles.staff) return "スタッフ画面";
  return "パートナー画面";
}
