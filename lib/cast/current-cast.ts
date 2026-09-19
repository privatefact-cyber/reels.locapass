import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * ログイン中のキャスト本人(locapass_cast_members)。キャストでなければ null。
 * 未ログインなら店舗ログインへ(ログイン後は /dashboard がロールで振り分ける)。
 * 個人情報の列(本名・住所など)は本人画面では使わないので読まない。
 */
export async function requireCurrentCast() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/dashboard/cast");
  }

  const { data: castId } = await supabase.rpc("locapass_current_cast_id");

  if (!castId) {
    return null;
  }

  const { data: cast } = await supabase
    .from("locapass_cast_members")
    .select("id, name, shop_id, pr_text, avatar_url, cast_code, user_id, locapass_shops ( name, portal_id )")
    .eq("id", castId)
    .single();

  return cast;
}
