import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const { endpoint } = (await request.json()) ?? {};
  if (typeof endpoint !== "string") {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  // RLS(user_id = auth.uid())により、他ユーザーの購読を消せないことをDB側でも保証する。
  const { error } = await supabase
    .from("locapass_push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
