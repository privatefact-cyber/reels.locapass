import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { STALE_PENDING_DAYS, autoRejectStalePending } from "@/lib/youtube/stockHygiene";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 毎日、保留のまま{STALE_PENDING_DAYS}日以上たった動画ストックの候補を「除外」にする(vercel.json の crons から呼ばれる)。
 * 公開済みの動画は対象外。データは消さず、除外タブから元に戻せる。?dry=1 なら件数だけ返し、DBは変えない。
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const dryRun = new URL(req.url).searchParams.get("dry") === "1";
    const result = await autoRejectStalePending({ dryRun });
    if (!dryRun && "rejected" in result && result.rejected > 0) revalidatePath("/admin/youtube-stock");
    return NextResponse.json(result);
  } catch (error) {
    console.error("保留の自動除外に失敗しました", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "failed" }, { status: 502 });
  }
}
