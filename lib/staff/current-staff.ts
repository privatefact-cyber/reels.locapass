import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * ログイン中のスタッフ本人(locapass_shop_staff_members)。スタッフでなければ null。
 * 未ログインなら店舗ログインへ(ログイン後は /dashboard がロールで振り分ける)。
 */
export async function requireCurrentStaff() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/dashboard/staff");
  }

  const { data: staffMemberId } = await supabase.rpc("locapass_current_staff_member_id");

  if (!staffMemberId) {
    return null;
  }

  const { data: staff } = await supabase
    .from("locapass_shop_staff_members")
    .select("id, name, shop_id, bio, avatar_url, user_id, locapass_shops ( name, portal_id )")
    .eq("id", staffMemberId)
    .single();

  return staff;
}
