import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Supabase Auth標準のコールバック(PKCE/OAuthのcode交換)。
 * ログイン成功後、locapass_members(id=auth.users.id)へ自分の行をupsertする。
 * 新規なら初期プロフィールを作成、既存ならlast_login_atだけ更新する
 * (nicknameまで一律上書きすると、mypage/accountで設定済みのニックネームが
 *  ログインのたびに消えてしまうため、既存行がある場合はnicknameに触らない)。
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectTo = searchParams.get("redirect") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { data } = await supabase.auth.exchangeCodeForSession(code);
    const user = data.user;

    if (user) {
      const { data: existing } = await supabase
        .from("locapass_members")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      if (existing) {
        await supabase.from("locapass_members").update({ last_login_at: new Date().toISOString() }).eq("id", user.id);
      } else {
        const defaultNickname =
          (user.user_metadata?.full_name as string | undefined) ??
          (user.user_metadata?.name as string | undefined) ??
          "ゲスト";
        await supabase.from("locapass_members").insert({
          id: user.id,
          nickname: defaultNickname,
          avatar_url: (user.user_metadata?.avatar_url as string | undefined) ?? null,
        });
      }
    }
  }

  return NextResponse.redirect(`${origin}${redirectTo}`);
}
