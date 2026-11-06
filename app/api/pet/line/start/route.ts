import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";

/**
 * ワンコ手帳の「LINEで通知を受け取る」の入り口。ログイン中の人だけ。
 * いつものLINEログインと同じチャネル・同じ戻り先(/api/auth/line/callback)を使い、Cookieの mode で連携だと伝える。
 * bot_prompt=aggressive で、LINE公式アカウントの友だち追加もその場で出す
 * (LINE Developersで、LINEログインのチャネルに公式アカウントがリンクされている必要がある)。
 */
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/pet/login?redirect=${encodeURIComponent("/pet/settings")}`, origin));

  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  if (!channelId) return NextResponse.redirect(new URL("/pet/settings?line=error", origin));

  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  const url = new URL("https://access.line.me/oauth2/v2.1/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", channelId);
  url.searchParams.set("redirect_uri", `${origin}/api/auth/line/callback`);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "profile openid");
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("bot_prompt", "aggressive");

  const res = NextResponse.redirect(url.toString());
  res.cookies.set("line_oauth", JSON.stringify({ state, nonce, redirect: "/pet/settings", mode: "pet_link" }), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
