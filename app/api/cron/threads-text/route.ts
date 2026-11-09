import { NextResponse } from "next/server";
import { runThreadsTextCron } from "@/lib/social/threadsPosts";
import { runSocialAutomation } from "@/lib/social/socialAutomation";
import { collectSocialInsights } from "@/lib/social/socialInsights";

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
    if (!dry) {
      const automation = await runSocialAutomation().catch((e) => [{ destination: "all", result: `failed: ${e instanceof Error ? e.message : "自動運転に失敗"}` }]);
      (result as Record<string, unknown>).automation = automation;
      const hourJst = new Date(Date.now() + 9 * 3_600_000).getUTCHours();
      if (hourJst === 3) (result as Record<string, unknown>).insights = await collectSocialInsights(20).catch((e) => ({ error: e instanceof Error ? e.message : "成績取得に失敗" }));
    }
    const r = result as { result?: { ok?: boolean }; scheduledError?: string };
    const failed = Boolean(r.scheduledError) || r.result?.ok === false;
    return NextResponse.json(result, { status: failed ? 502 : 200 });
  } catch (error) {
    console.error("Threadsの文章投稿に失敗しました", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "threads text failed" }, { status: 502 });
  }
}
