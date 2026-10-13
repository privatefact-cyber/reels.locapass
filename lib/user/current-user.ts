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

  // 管理者・店舗スタッフ等の権限を持つアカウントも、一般会員と同じ「個人のマイページ」を開ける。
  // (以前は運営者を /admin へ弾いていたが、個人の立場と管理の立場は /dashboard で選ぶ方式に変えた。)

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
