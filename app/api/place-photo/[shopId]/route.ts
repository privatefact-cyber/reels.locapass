import { NextResponse } from "next/server";
import { createStaticClient } from "@/lib/supabase/static";
import { fetchPhotoUri, fetchPlacePhotos } from "@/lib/places/googlePlaces";

// Googleの写真は自前保存せず、表示のたびにGoogleの一時URLへリダイレクトする(規約対応)。
// cover_url にこのエンドポイントのURLを入れておくと、既存の画像表示がそのまま使える。
export async function GET(_req: Request, { params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  // 公開店舗の情報だけを読むので匿名クライアントで足りる(非公開店舗はRLSで返らない)。
  const admin = createStaticClient();
  const { data: shop } = await admin
    .from("locapass_shops")
    .select("google_place_id, google_photo_name, status")
    .eq("id", shopId)
    .maybeSingle();
  if (!shop || shop.status !== "active" || !shop.google_photo_name) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    let uri = await fetchPhotoUri(shop.google_photo_name);
    if (!uri && shop.google_place_id) {
      // 写真リソース名が期限切れのとき: place_idから取り直す
      const photos = await fetchPlacePhotos(shop.google_place_id);
      if (photos[0]) uri = await fetchPhotoUri(photos[0].name);
    }
    if (!uri) return new NextResponse(null, { status: 404 });
    return NextResponse.redirect(uri, {
      status: 302,
      // 一時URLなので長くはキャッシュしない
      headers: { "Cache-Control": "public, max-age=600, s-maxage=1800" },
    });
  } catch (e) {
    console.error("[place-photo]", shopId, e);
    return new NextResponse(null, { status: 502 });
  }
}
