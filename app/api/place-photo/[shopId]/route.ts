import { NextResponse } from "next/server";
import { createStaticClient } from "@/lib/supabase/static";
import { fetchPhotoUri, fetchPlacePhotos } from "@/lib/places/googlePlaces";

// Googleの写真は自前保存せず、表示のたびにGoogleの一時URLへリダイレクトする(規約対応)。
// cover_url にこのエンドポイントのURLを入れておくと、既存の画像表示がそのまま使える。
//
// 課金事故対策(2026-09-30): このルートは誰でも呼べ、呼ぶたびにGoogle Places(写真)の有料API
// (約1,000回7ドル)を叩く。以前はCDNキャッシュが30分だけで、9月に約1万円の請求になった。
//   1. 解決したURIをインスタンス内でも TTL の間覚えておき、Googleを叩く回数を減らす。
//   2. ブラウザ/CDNのキャッシュを長くする(URIが古くなっても、次に取り直すまで約6時間)。
//   3. 1インスタンスあたり1日のGoogle呼び出し回数に上限を付ける(超えたら503で止める)。
//   Google側の1日上限(クォータ)が最後の砦。

const URI_TTL_MS = 6 * 60 * 60 * 1000; // 6時間
const BROWSER_MAX_AGE = 60 * 30; // 30分
const CDN_MAX_AGE = 60 * 60 * 6; // 6時間
const DAILY_UPSTREAM_LIMIT = Number(process.env.PLACE_PHOTO_DAILY_LIMIT ?? 300); // 1インスタンス・1日あたり
const MAX_CACHED_SHOPS = 500;

const uriCache = new Map<string, { uri: string; expiresAt: number }>();
let budget = { day: "", used: 0 };

function takeBudget(): boolean {
  const day = new Date().toISOString().slice(0, 10);
  if (budget.day !== day) budget = { day, used: 0 };
  if (budget.used >= DAILY_UPSTREAM_LIMIT) return false;
  budget.used += 1;
  return true;
}

function redirectTo(uri: string) {
  return NextResponse.redirect(uri, {
    status: 302,
    headers: {
      "Cache-Control": `public, max-age=${BROWSER_MAX_AGE}, s-maxage=${CDN_MAX_AGE}, stale-while-revalidate=600`,
    },
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;

  const cached = uriCache.get(shopId);
  if (cached && cached.expiresAt > Date.now()) return redirectTo(cached.uri);

  // 公開店舗の情報だけを読むので匿名クライアントで足りる(非公開店舗はRLSで返らない)。
  const admin = createStaticClient();
  const { data: shop } = await admin
    .from("locapass_shops")
    .select("google_place_id, google_photo_name, status")
    .eq("id", shopId)
    .maybeSingle();
  if (!shop || shop.status !== "active" || !shop.google_photo_name) {
    return new NextResponse(null, {
      status: 404,
      headers: { "Cache-Control": "public, max-age=300, s-maxage=600" },
    });
  }

  if (!takeBudget()) {
    console.error("[place-photo] daily upstream limit reached", DAILY_UPSTREAM_LIMIT);
    return new NextResponse(null, { status: 503, headers: { "Retry-After": "3600", "Cache-Control": "no-store" } });
  }

  try {
    let uri = await fetchPhotoUri(shop.google_photo_name);
    if (!uri && shop.google_place_id && takeBudget()) {
      // 写真リソース名が期限切れのとき: place_idから取り直す
      const photos = await fetchPlacePhotos(shop.google_place_id);
      if (photos[0]) uri = await fetchPhotoUri(photos[0].name);
    }
    if (!uri) {
      return new NextResponse(null, {
        status: 404,
        headers: { "Cache-Control": "public, max-age=300, s-maxage=600" },
      });
    }
    if (uriCache.size >= MAX_CACHED_SHOPS) uriCache.clear();
    uriCache.set(shopId, { uri, expiresAt: Date.now() + URI_TTL_MS });
    return redirectTo(uri);
  } catch (e) {
    console.error("[place-photo]", shopId, e);
    return new NextResponse(null, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
