import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchMyRoles, homePathForRoles } from "@/lib/auth/roles";

/**
 * ログイン後の振り分け。ロール(super_admin / portal_admin / shop_admin / staff / cast / user)を
 * DBの locapass_my_roles() で判定し、それぞれの画面へリダイレクトする。
 */
export default async function DashboardIndexPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  redirect(homePathForRoles(await fetchMyRoles(supabase)));
}
