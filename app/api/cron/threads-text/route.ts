import { NextResponse } from "next/server";
import { runThreadsTextCron } from "@/lib/social/threadsPosts";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * LOCAPASS公式Threadsの投稿を動かす(vercel.json の crons から、30分おきに呼ばれる)。
 * ・予約の時間になった投稿を、1回に1本ずつ投稿する。
 * ・毎日12時台に1回、AIの下書きを作る/自動投稿する。THREADS_TEXT_MODE が "draft"(既定)なら下書きを作るだけ、"auto" なら自動で投稿、"off" なら何もしない。詳細は lib/social/threadsPosts.ts。
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
    const r = result as { result?: { ok?: boolean }; scheduledError?: string };
    const failed = Boolean(r.scheduledError) || r.result?.ok === false;
    return NextResponse.json(result, { status: failed ? 502 : 200 });
  } catch (error) {
    console.error("Threadsの文章投稿に失敗しました", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "threads text failed" }, { status: 502 });
  }
}
