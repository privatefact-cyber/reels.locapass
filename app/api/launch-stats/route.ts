import { NextResponse } from "next/server";
import { getLaunchStats } from "@/lib/stats/launchStats";

export const dynamic = "force-dynamic";

/** トップのモーダルのカウンター用。公開中の店舗数・リール本数だけを返す(誰でも見られる数字)。30秒だけ共有キャッシュする。 */
export async function GET() {
  const stats = await getLaunchStats();
  if (!stats) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return NextResponse.json(stats, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } });
}
