import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireCurrentStaff() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/staff/login");
  }

  const { data: staffMemberId } = await supabase.rpc("current_staff_member_id");

  if (!staffMemberId) {
    return null;
  }

  const { data: staff } = await supabase
    .from("shop_staff_members")
    .select("id, name, shop_id, bio, avatar_url, shops ( name )")
    .eq("id", staffMemberId)
    .single();

  return staff;
}
