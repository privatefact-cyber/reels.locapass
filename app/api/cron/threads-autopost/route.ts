import { NextResponse } from "next/server";
import { runThreadsAutopost } from "@/lib/social/threadsAutopost";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 公開中のリールを、LOCAPASS公式のThreadsへ自動で紹介する(vercel.json の crons から呼ばれる)。
 * 既定はオフ(THREADS_AUTOPOST_ENABLED=1 と、THREADS_USER_ID / THREADS_ACCESS_TOKEN が必要)。詳細は lib/social/threadsAutopost.ts。
 * ?dry=1 なら、投稿せずに「何を投稿するか」だけ返す(トークンが無くても動く。動作確認用)。
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const dryRun = new URL(req.url).searchParams.get("dry") === "1";
    const result = await runThreadsAutopost({ dryRun });
    const failed = result.posts.some((p) => p.status === "failed");
    return NextResponse.json(result, { status: failed ? 502 : 200 });
  } catch (error) {
    console.error("Threads自動投稿に失敗しました", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "threads autopost failed" }, { status: 502 });
  }
}
