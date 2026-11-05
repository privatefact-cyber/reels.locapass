import { NextResponse } from "next/server";
import { collectTokyoBeautyStock } from "@/lib/youtube/shopIngestion";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 東京の美容系Shortsを毎日新着分だけストックする。
 * 店舗確定・公式情報取込・リール投稿は既存の管理フローで行い、Cronでは動画収集と軽い既存店照合までに留める。
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.YOUTUBE_DATA_API_KEY) {
    return NextResponse.json({ skipped: "YOUTUBE_DATA_API_KEY not set" });
  }
  try {
    return NextResponse.json(await collectTokyoBeautyStock());
  } catch (error) {
    console.error("東京ビューティー動画の定期収集に失敗しました", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "collection failed" }, { status: 502 });
  }
}
