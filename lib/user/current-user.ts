import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireCurrentUser(redirectTo = "/mypage") {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/mypage/login?redirect=${encodeURIComponent(redirectTo)}`);
  }

  // キャスト・店舗スタッフ・運営(店舗ダッシュボード/プラットフォーム管理者)アカウントは
  // Cookieを共有しているだけの「たまたまログイン中の別人格」であり、一般ユーザーの
  // プライベートマイページを開かせるべきではない。それぞれの管理画面へ弾く。
  const [{ data: isAdmin }, { data: shopIds }, { data: castId }, { data: staffId }] = await Promise.all([
    supabase.rpc("is_platform_admin"),
    supabase.rpc("current_shop_ids"),
    supabase.rpc("current_cast_id"),
    supabase.rpc("current_staff_member_id"),
  ]);

  if (isAdmin) {
    redirect("/admin");
  }
  if (shopIds && shopIds.length > 0) {
    redirect("/dashboard");
  }
  if (castId) {
    redirect("/cast/mypage");
  }
  if (staffId) {
    redirect("/staff/mypage");
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id, nickname, avatar_url")
    .eq("id", user.id)
    .single();

  return {
    id: user.id,
    nickname: profile?.nickname ?? "ゲスト",
    avatarUrl: profile?.avatar_url ?? null,
  };
}
