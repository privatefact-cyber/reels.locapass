import { NextResponse } from "next/server";
import { LOCAPASS_HUB_PORTAL_ID, getCollectQueries, processPendingIngestions } from "@/lib/youtube/shopIngestion";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 東京(ロカパス本体)の、判定待ちの動画を少しずつ公開する。20分おきに呼ばれ、1回に最大12本(セブと同じペース)。
 * 新しい動画を探す収集は /api/cron/youtube-gourmet が1日1回行う。ここは「集めた分を店舗にして公開する」だけ。
 * 1日の公開数・総数・1店あたりの本数の上限は processPendingIngestions 側で守られる(lib/youtube/publishQuota.ts)。
 * 上限に届いていれば、AIも呼ばずに終わる。
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ skipped: "GEMINI_API_KEY not set" });
  try {
    // 手動で集めた古い候補を巻き込まないよう、定期収集の検索語・直近1週間の分だけを処理する。
    const { queries } = await getCollectQueries("gourmet");
    const processed = await processPendingIngestions({
      portalId: LOCAPASS_HUB_PORTAL_ID,
      limit: 12,
      userId: null,
      budgetMs: 200_000,
      sourceQueries: queries,
      createdAfter: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    return NextResponse.json({ processed });
  } catch (error) {
    console.error("東京動画の公開処理に失敗しました", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "drain failed" }, { status: 502 });
  }
}
