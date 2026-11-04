import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runShopFreshnessCheck } from "@/lib/shop/freshnessCheck";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 毎週、各店の公式URLの死活を確認して「最後に確認できた日」を更新する(vercel.json の crons から呼ばれる)。
 * 店舗の公開/非公開は変えない。連続3回見つからなかった店だけが、一覧の並びで後ろへ回る。
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { targets, tally, results } = await runShopFreshnessCheck(createAdminClient());
  return NextResponse.json({ targets, tally, updated: results.length });
}
