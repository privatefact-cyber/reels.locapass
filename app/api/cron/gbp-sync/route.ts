import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncAllToGbp } from "@/lib/gbp/sync";
import { gbpConfigured } from "@/lib/gbp/client";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 同期がオンの店舗の営業時間・電話などを、毎日Googleビジネスプロフィールへ送る(vercel.json の crons から呼ばれる)。
 * Google未接続(GBP_*の環境変数なし)のあいだは送信せず、何もしない。
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!gbpConfigured()) return NextResponse.json({ skipped: "GBP credentials not set" });
  const { results } = await syncAllToGbp(createAdminClient());
  return NextResponse.json({
    total: results.length,
    ok: results.filter((r) => r.status === "ok").length,
    error: results.filter((r) => r.status === "error").length,
  });
}
