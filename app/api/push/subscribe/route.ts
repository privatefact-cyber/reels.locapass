import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ブラウザのpushManager.subscribe()で取得したPushSubscriptionを保存する。
// RLS(user manage own push subscriptions)によりuser_id=自分の行しか書けないため、
// ここではログイン確認とペイロードの整形のみ行う。
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const body = await request.json();
  const { endpoint, keys } = body ?? {};

  if (typeof endpoint !== "string" || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "不正な購読情報です" }, { status: 400 });
  }

  const { error } = await supabase.from("locapass_push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth_key: keys.auth,
      user_agent: request.headers.get("user-agent"),
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
