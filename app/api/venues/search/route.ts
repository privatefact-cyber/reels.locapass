import { NextResponse, type NextRequest } from "next/server";
import { createStaticClient } from "@/lib/supabase/static";
import { VENUE_CACHE_HEADERS } from "@/lib/map/cacheHeaders";
import { distanceMeters } from "@/lib/map/getVenues";

/** 1回の検索で見るマッチ件数の上限。 */
const MATCH_LIMIT = 200;

/**
 * 掲載店舗そのものを検索して、飛び先の範囲を返す。
 *
 * 外部ジオコーダに地名を投げると「渋谷」で地方の渋谷、「東京」で札幌市東区に飛ぶ。
 * そもそも店舗が無い場所に飛んでも意味がないので、まず自分のデータを引いて
 * 「実際に掲載がある場所」へ寄せる。ここで見つからないときだけ、
 * クライアント側が外部ジオコーダ(lib/map/geocode.ts)にフォールバックする。
 *
 * 返すのは範囲と件数だけで、カードのデータは含めない
 * (カードは移動後に /api/venues が表示範囲ぶんだけ取る)。
 *
 * locapass_shopsには店舗単位のエリア列が無いため、サイト名(locapass_sites.name/slug、
 * 例:「水戸」「大洗」)でのマッチをエリア名の代わりに使う。
 */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ error: "q is required" }, { status: 400 });

  // PostgRESTのor()はカンマ・括弧で区切られるので、値に含まれていると式が壊れる。
  const safe = q.replace(/[,()*\\]/g, " ").trim();
  if (!safe) return NextResponse.json({ match: null }, { headers: VENUE_CACHE_HEADERS });

  // 現在地(地図の中心)。同名の地名が複数ある場合の近い方を選ぶのに使う。
  // Number(null)は0になり「緯度0経度0」を有効な座標として扱ってしまうので、
  // 未指定かどうかは文字列のまま判定する。
  const latRaw = request.nextUrl.searchParams.get("lat");
  const lngRaw = request.nextUrl.searchParams.get("lng");
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  const origin =
    latRaw !== null && lngRaw !== null && Number.isFinite(lat) && Number.isFinite(lng)
      ? { lat, lng }
      : null;

  // 公開中の店舗だけを見るので、cookieに依存しないクライアントで引く(CDNキャッシュできるように)。
  const supabase = createStaticClient();

  // サイト名(「水戸」「大洗」等)に一致したら、そのサイトの店舗を優先的に検索対象にする。
  const { data: matchedSites } = await supabase
    .from("locapass_sites")
    .select("id, name, slug")
    .or([`name.ilike.%${safe}%`, `slug.ilike.%${safe}%`].join(","));
  const siteIds = (matchedSites ?? []).map((s) => s.id);

  const { data } = await supabase
    .from("locapass_shops")
    .select("id, site_id, name, address, lat, lng")
    .eq("status", "active")
    .not("lat", "is", null)
    .not("lng", "is", null)
    .or(
      [
        `name.ilike.%${safe}%`,
        `address.ilike.%${safe}%`,
        ...(siteIds.length ? [`site_id.in.(${siteIds.join(",")})`] : []),
      ].join(","),
    )
    .limit(MATCH_LIMIT);

  const shops = data ?? [];
  if (shops.length === 0) return NextResponse.json({ match: null }, { headers: VENUE_CACHE_HEADERS });

  const siteNameById = new Map((matchedSites ?? []).map((s) => [s.id, s.name]));

  // サイトごとにまとめる。「水戸」で水戸の店舗群、店名一致が複数サイトに散る、といったケースをここで分ける。
  const groups = new Map<number, { area: string; shops: typeof shops }>();
  for (const s of shops) {
    const g = groups.get(s.site_id) ?? {
      area: siteNameById.get(s.site_id) ?? "",
      shops: [] as typeof shops,
    };
    g.shops.push(s);
    groups.set(s.site_id, g);
  }

  const scored = [...groups.values()].map((g) => {
    const lats = g.shops.map((s) => s.lat as number);
    const lngs = g.shops.map((s) => s.lng as number);
    const bounds = {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
    };
    const center = {
      lat: (bounds.minLat + bounds.maxLat) / 2,
      lng: (bounds.minLng + bounds.maxLng) / 2,
    };
    // サイト名そのものが一致するものを最優先(「水戸」→ locapass_sites.name='水戸まちあるきポータル')。
    const areaExact = g.area !== "" && (g.area === safe || g.area.includes(safe));
    return {
      area: g.area,
      count: g.shops.length,
      bounds,
      center,
      rank: areaExact ? 0 : 1,
      distance: origin ? distanceMeters(origin.lat, origin.lng, center.lat, center.lng) : 0,
    };
  });

  scored.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    // 同じ強さなら、今見ている場所に近いエリアを選ぶ(地名の重複対策)。
    if (origin && Math.abs(a.distance - b.distance) > 1000) return a.distance - b.distance;
    return b.count - a.count;
  });

  const best = scored[0];
  return NextResponse.json({
    match: {
      area: best.area,
      count: best.count,
      bounds: best.bounds,
      center: best.center,
      totalMatches: shops.length,
    },
  }, { headers: VENUE_CACHE_HEADERS });
}
