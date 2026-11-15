import { NextResponse } from "next/server";
import { runOverseasAuto } from "@/lib/youtube/shopIngestion";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 海外ポータル(セブなど)の全自動の収集。数分おきに呼ばれ、
 *  - 判定待ちの動画があれば、店名・住所を特定して店舗を作り、リールを公開する(1回に最大12本)
 *  - 判定待ちが無くなり、前回の収集から20時間以上たっていれば、新しく動画を探して補充する
 * 店名・住所の裏付けが弱いものは公開せず保留にする(管理画面「海外の店舗を集める」の「保留の候補」に出る)。
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.YOUTUBE_DATA_API_KEY && !process.env.YOUTUBE_API_KEY) {
    return NextResponse.json({ skipped: "YOUTUBE_DATA_API_KEY or YOUTUBE_API_KEY not set" });
  }
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ skipped: "GEMINI_API_KEY not set" });
  try {
    return NextResponse.json(await runOverseasAuto());
  } catch (error) {
    console.error("海外ポータルの自動収集に失敗しました", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "overseas auto failed" }, { status: 502 });
  }
}
