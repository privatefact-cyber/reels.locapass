import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { APP_URL_SCHEME, appHandoffHtml } from "@/lib/auth/lineAppHandoff";
import { resolveSignupSource } from "@/lib/auth/signupSource";

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

  // Androidアプリ発のGoogleログイン(app=1)が、Chromeの安全な画面(Custom Tab)で戻ってきたとき。
  // PKCEの鍵(code_verifier)は、ログインを始めたアプリのWebViewにあるので、ここでは交換せず、
  // 認可コードをカスタムURL(locawan://)でアプリへ渡し、アプリのWebViewで交換する(コード単体では、他人は使えない)。
  const ua = request.headers.get("user-agent") ?? "";
  if (searchParams.get("app") === "1" && code && !ua.includes("LocaWanApp")) {
    const safeRedirect = redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : "/pet";
    const appUrl = `${APP_URL_SCHEME}://auth?c=${encodeURIComponent(code)}&r=${encodeURIComponent(safeRedirect)}`;
    return new NextResponse(appHandoffHtml(appUrl), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  }

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
          signup_source: await resolveSignupSource(redirectTo),
        });
      }
    }
  }

  return NextResponse.redirect(`${origin}${redirectTo}`);
}
