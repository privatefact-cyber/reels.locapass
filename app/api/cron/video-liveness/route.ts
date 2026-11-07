import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { runVideoLivenessCheck } from "@/lib/youtube/livenessCheck";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * 毎日、収集して公開したYouTube動画が削除・非公開・埋め込み禁止になっていないか確認する(vercel.json の crons から呼ばれる)。
 * 3日連続で問題があればリールを下書きに戻し、復活したら自動で公開に戻す。詳細は lib/youtube/livenessCheck.ts。
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    // ?dry=1 なら判定結果だけ返し、DBは一切変えない(初回の動作確認用)。
    const dryRun = new URL(req.url).searchParams.get("dry") === "1";
    const result = await runVideoLivenessCheck({ dryRun });
    if (!dryRun && "hidden" in result && (result.hidden.length > 0 || result.restored.length > 0)) revalidatePath("/", "layout");
    const failed = "errors" in result && result.errors.length > 0;
    return NextResponse.json(result, { status: failed ? 502 : 200 });
  } catch (error) {
    console.error("動画の死活確認に失敗しました", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "liveness check failed" }, { status: 502 });
  }
}
