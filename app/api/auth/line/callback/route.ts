import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { petAdmin } from "@/lib/pet/db";
import { finishPetLineLink } from "@/lib/pet/lineLink";
import { APP_URL_SCHEME, appHandoffHtml, appNonceFor, isAppState, toBase64Url } from "@/lib/auth/lineAppHandoff";

// mode: "pet_link" は、ログイン中の人がロカわんの通知をLINEで受け取るための連携(ログインはしない)。
type LineOAuthCookie = { state: string; nonce: string; redirect: string; mode?: "pet_link" };

type LineTokenResponse = {
  access_token: string;
  id_token: string;
};

type LineVerifyResponse = {
  sub: string;
  name?: string;
  picture?: string;
  email?: string;
};

function loginErrorRedirect(origin: string, redirect: string, reason: string, detail?: unknown) {
  console.error(`[line-login] ${reason}`, detail ?? "");
  // ロカわんから来た人は、ロカわんのログイン画面へ戻す
  const url = new URL(redirect.startsWith("/pet") ? "/pet/login" : "/mypage/login", origin);
  url.searchParams.set("redirect", redirect);
  url.searchParams.set("line_error", "1");
  const res = NextResponse.redirect(url);
  res.cookies.delete("line_oauth");
  return res;
}

const HANDOFF_REMEMBER_SECONDS = 180;

function handoffResponse(appUrl: string) {
  return new Response(appHandoffHtml(appUrl), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** 数分以内に、同じ state で作った「アプリに戻る」リンクがあれば返す */
async function findRememberedHandoff(state: string): Promise<string | null> {
  try {
    const since = new Date(Date.now() - HANDOFF_REMEMBER_SECONDS * 1000).toISOString();
    const { data } = await petAdmin().from("locapass_app_handoffs").select("app_url").eq("state", state).gte("created_at", since).maybeSingle();
    return (data?.app_url as string | undefined) ?? null;
  } catch (e) {
    console.error("[line-login] handoff_lookup_failed", e);
    return null;
  }
}

/** 「アプリに戻る」リンクを覚える(古いものは、ついでに消す) */
async function rememberHandoff(state: string, appUrl: string) {
  try {
    const admin = petAdmin();
    await admin.from("locapass_app_handoffs").delete().lt("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());
    await admin.from("locapass_app_handoffs").upsert({ state, app_url: appUrl, created_at: new Date().toISOString() }, { onConflict: "state" });
  } catch (e) {
    console.error("[line-login] handoff_remember_failed", e);
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const rawCookie = request.headers
    .get("cookie")
    ?.split("; ")
    .find((c) => c.startsWith("line_oauth="))
    ?.slice("line_oauth=".length);

  let saved: LineOAuthCookie | null = null;
  try {
    saved = rawCookie ? (JSON.parse(decodeURIComponent(rawCookie)) as LineOAuthCookie) : null;
  } catch {
    saved = null;
  }

  // ロカわんアプリ発のログインが、LINEアプリからの戻りでSafariに開いた場合(Cookieが無い)。
  // Safariで認証を終え、最後にカスタムURLでアプリへ受け渡す(lib/auth/lineAppHandoff.ts)。
  const appHandoff = !saved && Boolean(code) && isAppState(state);
  const redirectTo = saved?.redirect ?? (appHandoff ? "/pet" : "/mypage");

  if (!appHandoff && (!code || !state || !saved || state !== saved.state)) {
    return loginErrorRedirect(origin, redirectTo, "state_mismatch", { code, state, saved });
  }
  if (!code || !state) {
    return loginErrorRedirect(origin, redirectTo, "state_mismatch", { code, state, saved });
  }

  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET;
  if (!channelId || !channelSecret) {
    return loginErrorRedirect(origin, redirectTo, "missing_env");
  }

  // アプリ発のとき: 同じ戻りが2か所で開かれても(LINE内のブラウザとChrome)、同じ「アプリに戻る」ページを返す。
  if (appHandoff) {
    const remembered = await findRememberedHandoff(state);
    if (remembered) return handoffResponse(remembered);
  }

  const tokenRes = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${origin}/api/auth/line/callback`,
      client_id: channelId,
      client_secret: channelSecret,
    }),
  });
  if (!tokenRes.ok) {
    // 先に開かれた側が、まだ「覚える」前に、2回目が来た場合。少し待って、もう一度、覚えているページを探す。
    if (appHandoff) {
      for (let i = 0; i < 4; i++) {
        await new Promise((r) => setTimeout(r, 700));
        const remembered = await findRememberedHandoff(state);
        if (remembered) return handoffResponse(remembered);
      }
    }
    return loginErrorRedirect(origin, redirectTo, "token_exchange_failed", await tokenRes.text());
  }
  const tokenData = (await tokenRes.json()) as LineTokenResponse;

  // id_tokenの署名検証・nonce検証はLINEの検証エンドポイントに丸投げする
  // (自前でJWKS検証を実装しなくて済む、LINE公式が案内している方式)。
  const verifyRes = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      id_token: tokenData.id_token,
      client_id: channelId,
      nonce: saved?.nonce ?? appNonceFor(state),
    }),
  });
  if (!verifyRes.ok) {
    return loginErrorRedirect(origin, redirectTo, "id_token_verify_failed", await verifyRes.text());
  }
  const profile = (await verifyRes.json()) as LineVerifyResponse;

  if (saved?.mode === "pet_link") {
    return finishPetLineLink(origin, profile.sub, searchParams.get("friendship_status_changed") === "true");
  }

  const admin = createAdminClient();

  const { data: existingLink } = await admin
    .from("locapass_line_identities")
    .select("user_id")
    .eq("line_user_id", profile.sub)
    .maybeSingle();

  let userId = existingLink?.user_id ?? null;
  // locapass_line_identitiesに紐付きが無い(=初回ログイン)場合だけ新規Supabaseユーザーを作る。
  // メールアドレス許可を得ていないLINEチャネルではprofile.emailが来ないため、
  // その場合はダミーの一意メール(実在せず配信もしない、識別子としてのみ使用)を割り当てる。
  let userEmail: string | null = null;

  if (!userId) {
    userEmail = profile.email ?? `line-${profile.sub}@line.placeholder.locapass.net`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: userEmail,
      email_confirm: true,
      user_metadata: { provider: "line", line_user_id: profile.sub, name: profile.name, picture: profile.picture },
    });

    if (createError?.code === "email_exists") {
      // LINE側で許可されたメールが、Google/メール等で先に登録済みの既存アカウントと
      // 同じだったケース。新規作成はせず、その既存アカウントにLINEを紐付ける。
      const { data: foundUserId, error: lookupError } = await admin.rpc("locapass_get_user_id_by_email", {
        p_email: userEmail,
      });
      if (lookupError || !foundUserId) {
        return loginErrorRedirect(origin, redirectTo, "email_exists_lookup_failed", lookupError);
      }
      userId = foundUserId;
    } else if (createError || !created.user) {
      return loginErrorRedirect(origin, redirectTo, "create_user_failed", createError);
    } else {
      userId = created.user.id;
    }

    const { error: linkError } = await admin
      .from("locapass_line_identities")
      .insert({ line_user_id: profile.sub, user_id: userId });
    if (linkError) {
      return loginErrorRedirect(origin, redirectTo, "link_insert_failed", linkError);
    }
  } else {
    const { data: existingUser } = await admin.auth.admin.getUserById(userId);
    userEmail = existingUser.user?.email ?? null;
    if (!userEmail) {
      return loginErrorRedirect(origin, redirectTo, "existing_user_no_email");
    }
  }

  // Supabaseにはカスタムプロバイダーで直接セッションを発行する手段が無いため、
  // magiclinkのaction_linkを生成してそこへリダイレクトし、Supabase側にセッションを
  // 発行させる(公式に案内されている「カスタムOAuthのブリッジ」手法)。
  const { data: linkData, error: linkGenError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: userEmail,
    options: { redirectTo: `${origin}/auth/line/finish?redirect=${encodeURIComponent(redirectTo)}` },
  });
  if (linkGenError || !linkData.properties?.action_link) {
    return loginErrorRedirect(origin, redirectTo, "generate_link_failed", linkGenError);
  }

  if (appHandoff) {
    // Safariはここまで。ログイン用のリンク(1回限り)をアプリに渡す。アプリ側で state の一致を確かめてから使う。
    const appUrl = `${APP_URL_SCHEME}://auth?u=${toBase64Url(linkData.properties.action_link)}&s=${encodeURIComponent(state)}`;
    await rememberHandoff(state, appUrl);
    return handoffResponse(appUrl);
  }

  const response = NextResponse.redirect(linkData.properties.action_link);
  response.cookies.delete("line_oauth");
  return response;
}
