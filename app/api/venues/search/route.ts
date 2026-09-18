import { NextResponse, type NextRequest } from "next/server";
import { createStaticClient } from "@/lib/supabase/static";
import { VENUE_CACHE_HEADERS } from "@/lib/map/cacheHeaders";
import { distanceMeters } from "@/lib/map/getVenues";
import { slugToArea } from "@/lib/seo/area";
import { AFTER_GENRE } from "@/lib/shop/genres";

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

  // URLスラッグと同じローマ字表記(渋谷=shibuya 等)なら、エリアを直接特定できる。
  // 翻訳結果に依存しないぶん確実なので、住所の部分一致より優先して扱う。
  const romajiArea = slugToArea(safe.toLowerCase());

  // 通常の検索ではアフター(深夜飲食店)を対象にしない。アフタータグ選択中だけ after=1 で来る。
  const afterMode = request.nextUrl.searchParams.get("after") === "1";

  // 公開中の店舗だけを見るので、cookieに依存しないクライアントで引く(CDNキャッシュできるように)。
  const supabase = createStaticClient();
  const { data } = await supabase
    .from("shops")
    .select("id, name, area, lat, lng")
    .eq("status", "active")
    .or(afterMode ? `genre.eq.${AFTER_GENRE}` : `genre.is.null,genre.neq.${AFTER_GENRE}`)
    .not("lat", "is", null)
    .not("lng", "is", null)
    .or(
      [
        `area.ilike.%${safe}%`,
        `name.ilike.%${safe}%`,
        `address.ilike.%${safe}%`,
        `building_name.ilike.%${safe}%`,
        // ローマ字入力("shinjuku" / "kabukicho")はここで拾う。
        // address_en は日本語住所から自動生成している(lib/map/translateAddress.ts)。
        `address_en.ilike.%${safe}%`,
        ...(romajiArea ? [`area.eq.${romajiArea}`] : []),
      ].join(","),
    )
    .limit(MATCH_LIMIT);

  const shops = data ?? [];
  if (shops.length === 0) return NextResponse.json({ match: null }, { headers: VENUE_CACHE_HEADERS });

  // エリアごとにまとめる。「渋谷」で渋谷の店舗群、「NOBLE」で系列店が複数エリアに散る、
  // といったケースをここで分ける。
  const groups = new Map<string, { area: string; shops: typeof shops }>();
  for (const s of shops) {
    const key = s.area ?? "";
    const g = groups.get(key) ?? { area: key, shops: [] as typeof shops };
    g.shops.push(s);
    groups.set(key, g);
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
    // エリア名そのものが一致するものを最優先(「渋谷」→ area='渋谷')。
    const areaExact = g.area === safe || (romajiArea !== null && g.area === romajiArea);
    const areaPartial = g.area.includes(safe);
    return {
      area: g.area,
      count: g.shops.length,
      bounds,
      center,
      rank: areaExact ? 0 : areaPartial ? 1 : 2,
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
