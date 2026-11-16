import { NextResponse } from "next/server";
import { runShopChannelSync } from "@/lib/youtube/shopChannels";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 店舗オプション「動画の自動追加」: 店が登録したYouTubeチャンネルの新着を、6時間おきに巡回してリールに追加する。
 * 契約中(auto_video_enabled)で公開中の店のチャンネルだけが対象。1回に最大40チャンネル、巡回から5時間以上たったものを古い順に。
 * YouTube APIの消費は1チャンネルあたり2ポイント前後で、検索の枠(1日1万)をほとんど使わない。
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.YOUTUBE_DATA_API_KEY && !process.env.YOUTUBE_API_KEY) {
    return NextResponse.json({ skipped: "YOUTUBE_DATA_API_KEY or YOUTUBE_API_KEY not set" });
  }
  try {
    return NextResponse.json(await runShopChannelSync());
  } catch (error) {
    console.error("店舗チャンネルの巡回に失敗しました", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "channel sync failed" }, { status: 502 });
  }
}
