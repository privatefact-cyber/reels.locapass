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

  const all = await getVenuePins(parsed.bounds);
  // spots=1: 移動販売(出店予定のある店)のピンだけ返す。走る広告トラックが、映している範囲に関係なく店を知るために使う。
  const pins = request.nextUrl.searchParams.get("spots") === "1" ? all.filter((p) => p.spot) : all;
  return NextResponse.json({ pins }, { headers: VENUE_CACHE_HEADERS });
}
