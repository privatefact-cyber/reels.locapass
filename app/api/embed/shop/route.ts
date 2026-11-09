import { NextResponse } from "next/server";
import { createStaticClient } from "@/lib/supabase/static";
import { sanitizeImageUrl } from "@/lib/utils/sanitize-image-url";
import { shopPath } from "@/lib/locapass/publicUrls";
import { SITE_ORIGIN } from "@/lib/siteOrigin";

// 店舗の公式サイトに「LOCAPASS認証」バッジと最新リールを埋め込むための公開API(public/embed/shop-widget.js が呼ぶ)。
// 任意のドメインから認証なしで呼ばれる前提のため、cookieに依存しない anon クライアントを使い、
// RLS(公開中の店舗・リール)の範囲でしか読めない。返すのは店名・公開URL・リールのサムネイルとURLだけ。
export const runtime = "nodejs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("shop")?.trim().toUpperCase() ?? "";
  if (!/^[A-Z0-9]{4,12}$/.test(code)) {
    return NextResponse.json({ error: "shop query param is required" }, { status: 400, headers: CORS_HEADERS });
  }

  const supabase = createStaticClient();
  const { data: shop } = await supabase
    .from("locapass_shops")
    .select("id, name, slug, shop_code, portal:locapass_portals ( slug )")
    .eq("shop_code", code)
    .eq("status", "active")
    .maybeSingle();
  const portal = Array.isArray(shop?.portal) ? shop.portal[0] : shop?.portal;
  if (!shop || !portal) {
    return NextResponse.json({ error: "shop not found" }, { status: 404, headers: CORS_HEADERS });
  }

  const { data: rows, error } = await supabase
    .from("locapass_reels")
    .select("id, caption, poster_url, images, published_at")
    .eq("shop_id", shop.id)
    .eq("status", "publish")
    .or("expires_at.is.null,expires_at.gt.now()")
    .order("published_at", { ascending: false })
    .limit(12);
  if (error) {
    return NextResponse.json({ error: "failed to load reels" }, { status: 500, headers: CORS_HEADERS });
  }

  const reels = (rows ?? [])
    .map((row) => {
      const firstImage = (row.images as { url?: string }[] | null)?.[0]?.url;
      const thumb = sanitizeImageUrl(row.poster_url) ?? sanitizeImageUrl(firstImage);
      return thumb ? { id: row.id, url: `${SITE_ORIGIN}/reel/${row.id}`, thumbnailUrl: thumb, caption: (row.caption ?? "").slice(0, 60) } : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .slice(0, 6);

  return NextResponse.json(
    { shop: { name: shop.name, url: `${SITE_ORIGIN}/s/${shop.shop_code}`, pageUrl: `${SITE_ORIGIN}${shopPath(portal.slug, shop.slug)}` }, reels },
    { headers: { ...CORS_HEADERS, "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
