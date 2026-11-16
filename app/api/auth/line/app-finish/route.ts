import { NextResponse } from "next/server";
import { fromBase64Url } from "@/lib/auth/lineAppHandoff";

// ロカわんアプリのWebViewで開く、LINEログインの最後の入り口。
// Safariで認証を終えたあと、アプリがカスタムURL(locawan://)で受け取った「ログイン用のリンク」と state をここへ渡す。
// このWebViewは、ログイン開始時にCookie(line_oauth)を持っているので、state が一致する=自分が始めたログイン、と確かめられる。
// 一致しないもの(他人が始めたログインを流し込まれた等)は使わない。
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const u = searchParams.get("u");
  const s = searchParams.get("s");

  const fail = () => {
    const url = new URL("/pet/login", origin);
    url.searchParams.set("line_error", "1");
    const res = NextResponse.redirect(url);
    res.cookies.delete("line_oauth");
    return res;
  };

  const rawCookie = request.headers
    .get("cookie")
    ?.split("; ")
    .find((c) => c.startsWith("line_oauth="))
    ?.slice("line_oauth=".length);
  let savedState: string | null = null;
  try {
    savedState = rawCookie ? (JSON.parse(decodeURIComponent(rawCookie)) as { state?: string }).state ?? null : null;
  } catch {
    savedState = null;
  }
  if (!u || !s || !savedState || savedState !== s) {
    console.error("[line-login] app_finish_state_mismatch", { hasCookie: Boolean(savedState) });
    return fail();
  }

  // 渡されたリンクは、自分のSupabaseのログイン確認URLだけを許可する(任意のURLへ飛ばさない)
  let link: URL;
  try {
    link = new URL(fromBase64Url(u));
  } catch {
    return fail();
  }
  const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : null;
  if (link.protocol !== "https:" || !supabaseOrigin || link.origin !== supabaseOrigin) {
    console.error("[line-login] app_finish_bad_link");
    return fail();
  }

  const res = NextResponse.redirect(link.toString());
  res.cookies.delete("line_oauth");
  return res;
}
