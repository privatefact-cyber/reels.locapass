import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { geminiGenerateWithFallback } from "@/lib/gemini";
import { VEHICLE_CERT_PROMPT, normalizeVehicleCert } from "@/lib/vehicle/vehicleCert";

/**
 * 車検証の写真を、AIの画像読取で在庫の入力欄に入れられる形にして返す。
 * - 呼べるのは、その店舗の管理者(または運営者)だけ。LOCAPASSの管理画面(Cookieのログイン)と、
 *   公式サイトの管理画面(別ドメインから、ログインのトークンをAuthorizationヘッダーで付けて呼ぶ)の両方から使う。
 * - 所有者の氏名・住所・ナンバーなどの個人情報は、AIへの指示でも禁止し、返す項目も許可リストだけに絞る(lib/vehicle/vehicleCert.ts)。
 * - 画像・読取結果は保存しない。1店舗あたり1日100回までに制限する(費用の暴走防止)。
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const DAILY_LIMIT = 100;
const MAX_BASE64_CHARS = 4_000_000; // 約3MB。Vercelのリクエスト上限(4.5MB)に収める。端末側で縮小してから送る。

const CORS = {
  "Access-Control-Allow-Origin": "*", // 認証はCookieではなくトークンなので、どのドメインの公式サイトからでも呼べる
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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: "読取機能の設定がありません" }, 500);

  const body = await request.json().catch(() => null);
  const shopId = typeof body?.shopId === "string" ? body.shopId : "";
  const imageBase64 = typeof body?.imageBase64 === "string" ? body.imageBase64 : "";
  const mimeType = typeof body?.mimeType === "string" && /^image\/(jpeg|png|webp)$/.test(body.mimeType) ? body.mimeType : "image/jpeg";
  if (!/^[0-9a-f-]{36}$/i.test(shopId)) return json({ error: "店舗が指定されていません" }, 400);
  if (!imageBase64) return json({ error: "画像データがありません" }, 400);
  if (imageBase64.length > MAX_BASE64_CHARS) return json({ error: "画像が大きすぎます。もう一度撮影してください" }, 413);

  const { data: canManage } = await supabase.rpc("locapass_is_shop_admin", { p_shop_id: shopId });
  if (!canManage) return json({ error: "この店舗の車検証を読み取る権限がありません" }, 403);

  // 回数制限(読取の前に数えて記録する。失敗した読取も数える=費用が出ているため)
  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await admin.from("locapass_vehicle_cert_scans" as never).select("id", { count: "exact", head: true }).eq("shop_id", shopId).gte("created_at", since);
  if ((count ?? 0) >= DAILY_LIMIT) return json({ error: `1日の読取回数の上限(${DAILY_LIMIT}回)に達しました。明日もう一度お試しください` }, 429);
  await admin.from("locapass_vehicle_cert_scans" as never).insert({ shop_id: shopId, user_id: user.id } as never);

  const res = await geminiGenerateWithFallback(
    apiKey,
    {
      contents: [{ parts: [{ text: VEHICLE_CERT_PROMPT }, { inline_data: { mime_type: mimeType, data: imageBase64 } }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    },
    "vehicle-cert scan",
    45_000,
  );
  if (!res) return json({ error: "読み取りに失敗しました。少し待ってからもう一度お試しください" }, 502);

  const result = (await res.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null;
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!parsed) return json({ error: "読み取り結果を解析できませんでした。明るい場所でもう一度撮影してください" }, 502);

  const fields = normalizeVehicleCert(parsed);
  const found = Object.entries(fields).filter(([k, v]) => k !== "title" && v !== null).length;
  if (found === 0) return json({ error: "車検証として読み取れませんでした。車検証全体が写るように撮影してください" }, 422);
  return json({ fields });
}
