import { NextResponse, type NextRequest } from "next/server";
import { getVenueCards, MAX_CARD_LIMIT } from "@/lib/map/getVenues";
import { parseVenueQuery } from "@/lib/map/parseVenueQuery";
import { VENUE_CACHE_HEADERS } from "@/lib/map/cacheHeaders";

/**
 * カルーセル用の店舗カード(動画・キャスト付き)。
 * 位置の指定(lat/lng[+radius] か bbox)を必須にしてあり、指定が無ければ400を返す。
 * 全国分をまとめて返すことは無い。
 */
export async function GET(request: NextRequest) {
  const parsed = parseVenueQuery(request.nextUrl.searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const limitParam = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : MAX_CARD_LIMIT;

  const venues = await getVenueCards(parsed.bounds, parsed.center, limit);
  return NextResponse.json({ venues }, { headers: VENUE_CACHE_HEADERS });
}
