import { NextResponse, type NextRequest } from "next/server";
import { getVenuePins } from "@/lib/map/getVenues";
import { parseVenueQuery } from "@/lib/map/parseVenueQuery";
import { VENUE_CACHE_HEADERS } from "@/lib/map/cacheHeaders";

/**
 * 地図のピン用の軽量データ(id/座標/ジャンル/スポンサー有無のみ)。
 * 動画URLやキャストは含めないので、広域ズームでクラスタを描くときはこちらを使う。
 * こちらも位置の指定必須(指定無しは400)。
 */
export async function GET(request: NextRequest) {
  const parsed = parseVenueQuery(request.nextUrl.searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  // after=1 のときだけアフター(深夜飲食店)を返す。無指定ではアフター以外。
  const afterMode = request.nextUrl.searchParams.get("after") === "1";
  const pins = await getVenuePins(parsed.bounds, undefined, afterMode);
  return NextResponse.json({ pins }, { headers: VENUE_CACHE_HEADERS });
}
