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

  // locapassの運営者(root admin)アカウントは、一般会員のプライベートマイページを
  // 開かせるべきではないので管理画面へ弾く。店舗メンバー用ダッシュボードはlocapass側に
  // まだ無いため、ここでは判定しない(⑥ダッシュボード対応時に追加する)。
  const { data: rootAdmin } = await supabase
    .from("locapass_super_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (rootAdmin) {
    redirect("/admin");
  }

  const { data: profile } = await supabase
    .from("locapass_members")
    .select("id, nickname, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    // 初回ログイン。locapass_membersに自分の行を作る(id=auth.users.id、RLSでid=auth.uid()のみ許可)。
    await supabase.from("locapass_members").insert({ id: user.id, nickname: "ゲスト" });
  }

  return {
    id: user.id,
    nickname: profile?.nickname ?? "ゲスト",
    avatarUrl: profile?.avatar_url ?? null,
  };
}
