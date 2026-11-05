import { NextResponse, type NextRequest } from "next/server";
import { createStaticClient } from "@/lib/supabase/static";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { photoText } from "@/lib/photo/serverText";

/**
 * エリアフォト投稿時の「場所タグ候補」。写真の位置の近くにある locapass掲載店(locapass_venues)を返す。
 * Googleの場所(Places Nearby Search)は有料のため使わない(2026-11-06、Google系の有料APIは全面的に使わない方針)。
 * ログイン中の会員のみ(Supabaseアクセストークン必須)。
 * エリアフォトはWP(*.locapass.net)から呼ばれるためCORSを許可する。
 */
const ALLOWED_ORIGIN =
  process.env.NODE_ENV === "production"
    ? /^https:\/\/([a-z0-9-]+\.)?locapass\.net$/
    : /^(https:\/\/([a-z0-9-]+\.)?locapass\.net|http:\/\/localhost:\d+)$/;

function corsHeaders(origin: string | null) {
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    Vary: "Origin",
  };
  if (origin && ALLOWED_ORIGIN.test(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

type Candidate = {
  kind: "listed" | "spot";
  name: string;
  address: string | null;
  distance_m: number;
  venue_id?: string;
  place_id?: string;
};

function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

export async function GET(request: NextRequest) {
  const headers = corsHeaders(request.headers.get("origin"));
  const { t, locale } = await photoText();
  // WP(別オリジン)からはBearerトークン、locapass.net自身のページからはCookieのセッションで本人確認する。
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const supabase = createStaticClient();
  let authedUser = null;
  if (token) {
    const { data, error } = await supabase.auth.getUser(token);
    if (!error) authedUser = data.user;
  } else {
    const cookieClient = await createServerClient();
    authedUser = (await cookieClient.auth.getUser()).data.user;
  }
  if (!authedUser) return NextResponse.json({ error: t.apiLoginRequired }, { status: 401, headers });

  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "lat/lngが不正です" }, { status: 400, headers });
  }

  // ① 掲載店: 約300m四方のbboxで絞ってから距離順に並べる
  const d = 0.003;
  const { data: venues } = await supabase
    .from("locapass_venues")
    .select("id, name, name_en, address, lat, lng")
    .eq("status", "publish")
    .gte("lat", lat - d)
    .lte("lat", lat + d)
    .gte("lng", lng - d)
    .lte("lng", lng + d)
    .limit(30);

  const listed: Candidate[] = (venues ?? [])
    .filter((v) => v.lat != null && v.lng != null)
    .map((v) => ({
      kind: "listed" as const,
      name: locale !== "ja" && v.name_en ? v.name_en : v.name,
      address: v.address,
      venue_id: v.id,
      distance_m: distanceM(lat, lng, v.lat as number, v.lng as number),
    }))
    .sort((a, b) => a.distance_m - b.distance_m)
    .slice(0, 5);

  return NextResponse.json({ candidates: listed }, { headers });
}
