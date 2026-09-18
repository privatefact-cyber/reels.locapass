import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireCurrentShop() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: staffRow } = await supabase
    .from("shop_staff")
    .select("shop_id, shops ( id, name )")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (staffRow) {
    const shop = Array.isArray(staffRow.shops) ? staffRow.shops[0] : staffRow.shops;
    if (shop) return { id: shop.id, name: shop.name };
  }

  // 運営者が管理コンソールから「代理ログイン」中の場合、shop_staffが無くても
  // admin_impersonations経由でその店舗を閲覧・操作できる(パスワードは一切変更しない)。
  const { data: impersonation } = await supabase
    .from("admin_impersonations")
    .select("shop_id, shops ( id, name )")
    .eq("admin_user_id", user.id)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();

  if (impersonation) {
    const shop = Array.isArray(impersonation.shops) ? impersonation.shops[0] : impersonation.shops;
    if (shop) return { id: shop.id, name: shop.name };
  }

  return null;
}

export async function getActiveImpersonation() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("admin_impersonations")
    .select("shop_id, shops ( name )")
    .eq("admin_user_id", user.id)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const shop = Array.isArray(data.shops) ? data.shops[0] : data.shops;
  return shop ? { shopId: data.shop_id, shopName: shop.name } : null;
}
