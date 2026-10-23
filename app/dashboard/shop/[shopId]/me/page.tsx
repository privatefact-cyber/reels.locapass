import { notFound, redirect } from "next/navigation";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import { createClient } from "@/lib/supabase/server";
import { staffPath } from "@/lib/locapass/publicUrls";

/**
 * 店長(店舗のオーナー・管理者ID)のマイページの入口。スタッフと同じマイページ(プロフィール・投稿)を使う。
 * 初めて開いたときに、本人のスタッフプロフィールを作って紐づける(DBの locapass_ensure_my_staff_profile)。
 * 運営(システム管理者・エリア管理者)が代理で開いた場合は店舗のIDそのものではないので、店舗管理画面へ戻す。
 */
export default async function ShopAdminMyPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const viewer = await getShopForManager(shopId);
  if (!viewer) notFound();
  if (viewer.isOperator) redirect(`/dashboard/shop/${shopId}`);

  const supabase = await createClient();
  // locapass_ensure_my_staff_profile は型定義(types/supabase.ts)に未反映のため、clientごとanyにしてthisを保つ。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: staffId, error } = await (supabase as any).rpc("locapass_ensure_my_staff_profile", { p_shop_id: shopId });
  if (error || !staffId) redirect(`/dashboard/shop/${shopId}`);

  const { data: staff } = await supabase
    .from("locapass_shop_staff_members")
    .select("issue_no, locapass_shops ( slug, portal:locapass_portals ( slug ) )")
    .eq("id", staffId as string)
    .maybeSingle();
  const shop = staff ? (Array.isArray(staff.locapass_shops) ? staff.locapass_shops[0] : staff.locapass_shops) : null;
  const portal = shop ? (Array.isArray(shop.portal) ? shop.portal[0] : shop.portal) : null;
  if (!staff || !shop?.slug || !portal?.slug) redirect(`/dashboard/shop/${shopId}`);

  redirect(staffPath(portal.slug, shop.slug, staff.issue_no));
}
