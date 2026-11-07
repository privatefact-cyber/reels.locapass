import { NextResponse } from "next/server";
import { LOCAPASS_HUB_PORTAL_ID, TOKYO_GOURMET_QUERIES, collectTokyoGourmetStock, processPendingIngestions } from "@/lib/youtube/shopIngestion";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 東京のカフェ・グルメ系Shortsを毎日新着分だけ収集し、店名・住所が確かなものはそのまま店舗登録→リール公開まで行う
 * (美容系の /api/cron/youtube-beauty と同じ作り)。
 * 判定はAI(Gemini+Google検索)で、店名・住所の裏付けが弱いものは公開せず保留にして、
 * 動画ストック(/admin/youtube-stock)の「判定を編集」で公式サイトURLを貼って直す。
 * 手動で集めた古い未判定の候補は巻き込まないよう、この収集の検索語・直近の分だけを処理する。
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.YOUTUBE_DATA_API_KEY && !process.env.YOUTUBE_API_KEY) {
    return NextResponse.json({ skipped: "YOUTUBE_DATA_API_KEY or YOUTUBE_API_KEY not set" });
  }
  const started = Date.now();
  try {
    const collected = await collectTokyoGourmetStock();
    // 収集に時間がかかった分だけ公開処理の持ち時間を減らし、maxDurationを超えないようにする。
    const budgetMs = Math.max(0, 240_000 - (Date.now() - started));
    const processed = process.env.GEMINI_API_KEY
      ? await processPendingIngestions({
          portalId: LOCAPASS_HUB_PORTAL_ID,
          limit: 15,
          userId: null,
          budgetMs,
          sourceQueries: TOKYO_GOURMET_QUERIES,
          createdAfter: new Date(started - 36 * 60 * 60 * 1000).toISOString(),
        })
      : { skipped: "GEMINI_API_KEY not set" };
    const failed = collected.errors.length > 0 && collected.fetched === 0;
    return NextResponse.json({ collected, processed }, { status: failed ? 502 : 200 });
  } catch (error) {
    console.error("東京カフェ・グルメ動画の定期収集に失敗しました", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "collection failed" }, { status: 502 });
  }
}
