import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sweepTranslations } from "@/lib/i18n/sweepTranslations";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 翻訳の取りこぼしを毎晩拾う(vercel.json の crons から呼ばれる)。
 * Vercel Cron は環境変数 CRON_SECRET があれば `Authorization: Bearer $CRON_SECRET` を付けて呼ぶ。
 * 店舗情報・車両・リール投稿文のうち、翻訳が無い/日本語が変わって古いものだけを、1回あたり上限つきで翻訳する。
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ skipped: "GEMINI_API_KEY not set" });
  return NextResponse.json(await sweepTranslations(createAdminClient() as any));
}
