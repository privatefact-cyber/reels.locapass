import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sweepTranslations } from "@/lib/i18n/sweepTranslations";

/**
 * 公式サイトの管理画面で保存した直後に呼び、その店舗の翻訳(車両・サイト文言・ブログ記事)を、すぐ作る。
 * 夜間の自動処理(/api/cron/translations)を待たずに、英語・中国語を反映するため。
 * 日本語が変わっていない行は何もしないので、何度呼んでも費用は増えない(新しい・変わった文章の分だけ)。
 * 呼べるのは、その店舗の管理者(または運営者)だけ。1回に訳すのは最大20行。
 */
export const runtime = "nodejs";
export const maxDuration = 120;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: CORS });

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(request: Request) {
  const authz = request.headers.get("authorization");
  const supabase = authz?.toLowerCase().startsWith("bearer ")
    ? createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        global: { headers: { Authorization: authz } },
        auth: { persistSession: false },
      })
    : await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "ログインが必要です" }, 401);

  const body = await request.json().catch(() => null);
  const shopId = typeof body?.shopId === "string" ? body.shopId : "";
  if (!/^[0-9a-f-]{36}$/i.test(shopId)) return json({ error: "店舗が指定されていません" }, 400);
  const { data: canManage } = await supabase.rpc("locapass_is_shop_admin", { p_shop_id: shopId });
  if (!canManage) return json({ error: "この店舗を操作する権限がありません" }, 403);
  if (!process.env.GEMINI_API_KEY) return json({ skipped: true });

  const result = await sweepTranslations(createAdminClient() as never, { maxRows: 20, deadlineMs: 100_000, shopId });
  return json(result);
}
