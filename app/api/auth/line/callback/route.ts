import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type LineOAuthCookie = { state: string; nonce: string; redirect: string };

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
  const url = new URL("/mypage/login", origin);
  url.searchParams.set("redirect", redirect);
  url.searchParams.set("line_error", "1");
  const res = NextResponse.redirect(url);
  res.cookies.delete("line_oauth");
  return res;
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

  const redirectTo = saved?.redirect ?? "/mypage";

  if (!code || !state || !saved || state !== saved.state) {
    return loginErrorRedirect(origin, redirectTo, "state_mismatch", { code, state, saved });
  }

  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET;
  if (!channelId || !channelSecret) {
    return loginErrorRedirect(origin, redirectTo, "missing_env");
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
      nonce: saved.nonce,
    }),
  });
  if (!verifyRes.ok) {
    return loginErrorRedirect(origin, redirectTo, "id_token_verify_failed", await verifyRes.text());
  }
  const profile = (await verifyRes.json()) as LineVerifyResponse;

  const admin = createAdminClient();

  const { data: existingLink } = await admin
    .from("line_identities")
    .select("user_id")
    .eq("line_user_id", profile.sub)
    .maybeSingle();

  let userId = existingLink?.user_id ?? null;
  // line_identitiesに紐付きが無い(=初回ログイン)場合だけ新規Supabaseユーザーを作る。
  // メールアドレス許可を得ていないLINEチャネルではprofile.emailが来ないため、
  // その場合はダミーの一意メール(実在せず配信もしない、識別子としてのみ使用)を割り当てる。
  let userEmail: string | null = null;

  if (!userId) {
    userEmail = profile.email ?? `line-${profile.sub}@line.placeholder.luxela.jp`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: userEmail,
      email_confirm: true,
      user_metadata: { provider: "line", line_user_id: profile.sub, name: profile.name, picture: profile.picture },
    });

    if (createError?.code === "email_exists") {
      // LINE側で許可されたメールが、Google/メール等で先に登録済みの既存アカウントと
      // 同じだったケース。新規作成はせず、その既存アカウントにLINEを紐付ける。
      const { data: foundUserId, error: lookupError } = await admin.rpc("get_user_id_by_email", {
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
      .from("line_identities")
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

  const response = NextResponse.redirect(linkData.properties.action_link);
  response.cookies.delete("line_oauth");
  return response;
}
