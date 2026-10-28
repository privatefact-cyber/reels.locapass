import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// 簡易な連打対策(サーバーレスのため端末・インスタンスごとの目安)。
const hits = new Map<string, number[]>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > 30;
}

/**
 * サポートAIの返事への評価(役に立った=1 / 立たなかった=-1)。
 * 記録のID(推測できないUUID)を知っている画面からだけ送れる。変えられるのは評価の列だけ。
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { id?: unknown; value?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const value = body?.value === 1 || body?.value === -1 ? body.value : null;
  if (!/^[0-9a-f-]{36}$/i.test(id) || value === null) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  // 更新は、対象が0件でもエラーにならないので、行が返ったかで確かめる。
  const { data, error } = await (createAdminClient() as any)
    .from("locapass_support_questions")
    .update({ feedback: value, feedback_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
