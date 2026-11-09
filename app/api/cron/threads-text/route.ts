import { NextResponse } from "next/server";
import { runThreadsTextCron } from "@/lib/social/threadsPosts";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * LOCAPASS公式Threadsへ、AIが書いた文章を投稿する(vercel.json の crons から、毎日1回呼ばれる)。
 * THREADS_TEXT_MODE が "draft"(既定)なら下書きを作るだけ、"auto" なら自動で投稿、"off" なら何もしない。詳細は lib/social/threadsPosts.ts。
 * ?dry=1 なら、文章を作るだけで、保存も投稿もしない(動作確認用)。
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const dry = new URL(req.url).searchParams.get("dry") === "1";
    const result = await runThreadsTextCron({ dry });
    const failed = "result" in result && result.result && "ok" in result.result && result.result.ok === false;
    return NextResponse.json(result, { status: failed ? 502 : 200 });
  } catch (error) {
    console.error("Threadsの文章投稿に失敗しました", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "threads text failed" }, { status: 502 });
  }
}
