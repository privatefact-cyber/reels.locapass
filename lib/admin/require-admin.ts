import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const { data: rootAdmin } = await supabase
    .from("locapass_root_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!rootAdmin) {
    redirect("/admin/login");
  }

  return user;
}
