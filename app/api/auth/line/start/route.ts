import { NextResponse } from "next/server";
import crypto from "node:crypto";

// SupabaseにLINEの組み込みOAuthプロバイダーが無いため、認可コードフローを自前実装している。
// この endpoint は「LINEでログイン」ボタンから呼ばれ、LINEの認可画面へ飛ばす入り口。
// state/nonce/戻り先パスを1つのCookieにまとめて持たせ、callback側で検証する。
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const redirect = searchParams.get("redirect") ?? "/mypage";

  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  if (!channelId) {
    console.error("[line-login] missing_env: LINE_LOGIN_CHANNEL_ID");
    const url = new URL("/mypage/login", origin);
    url.searchParams.set("redirect", redirect);
    url.searchParams.set("line_error", "1");
    return NextResponse.redirect(url);
  }

  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();

  const authorizeUrl = new URL("https://access.line.me/oauth2/v2.1/authorize");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", channelId);
  authorizeUrl.searchParams.set("redirect_uri", `${origin}/api/auth/line/callback`);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("scope", "profile openid email");
  authorizeUrl.searchParams.set("nonce", nonce);

  const response = NextResponse.redirect(authorizeUrl.toString());
  response.cookies.set("line_oauth", JSON.stringify({ state, nonce, redirect }), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
