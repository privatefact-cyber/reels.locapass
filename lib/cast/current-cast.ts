import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireCurrentCast() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/cast/login");
  }

  const { data: castId } = await supabase.rpc("current_cast_id");

  if (!castId) {
    return null;
  }

  const { data: cast } = await supabase
    .from("cast_members")
    .select("id, name, shop_id, pr_text, avatar_url, cast_code, shops ( name )")
    .eq("id", castId)
    .single();

  return cast;
}
