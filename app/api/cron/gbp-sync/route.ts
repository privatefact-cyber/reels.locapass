import { NextResponse } from "next/server";
import { runGbpDaily } from "@/lib/gbp/daily";
import { gbpConfigured } from "@/lib/gbp/client";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 毎日、Googleビジネスプロフィールとの連携をまとめて処理する(vercel.json の crons から呼ばれる)。
 * 営業情報の送信 / 口コミの取り込みと通知 / 同意済み店舗の写真の送信。
 * Google未接続(GBP_*の環境変数なし)のあいだは何もしない。
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!gbpConfigured()) return NextResponse.json({ skipped: "GBP credentials not set" });
  return NextResponse.json(await runGbpDaily());
}
