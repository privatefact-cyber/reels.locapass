import { NextResponse, type NextRequest } from "next/server";
import { getReelPage } from "@/lib/reels/getPortalFeedData";
import { FEED_REELS_PAGE } from "@/lib/reels/feedPaging";
import { getServerLocale } from "@/lib/i18n/getServerLocale";

/**
 * リール一覧の続き(トップ・子ポータルの無限スクロール/スワイプ用)。
 * 初回表示は少なめの件数だけ渡して速く描画し、末尾に近づいたらここで次のページを足す。
 * 言語は middleware が ?lang= または呼び出し元ページのURLから決める(getServerLocale)。
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const offset = Math.max(0, Math.min(Number.parseInt(params.get("offset") ?? "0", 10) || 0, 10000));
  const limit = Math.max(1, Math.min(Number.parseInt(params.get("limit") ?? "", 10) || FEED_REELS_PAGE, FEED_REELS_PAGE));
  const portalRaw = params.get("portal");
  const portalId = portalRaw ? Number.parseInt(portalRaw, 10) : null;
  if (portalRaw && !Number.isInteger(portalId)) {
    return NextResponse.json({ error: "invalid portal" }, { status: 400 });
  }

  const locale = await getServerLocale();
  const page = await getReelPage(portalId, offset, limit, locale);
  return NextResponse.json(page, {
    // クエリ(offset/portal/lang)ごとにCDNへ短時間キャッシュ。新着の反映は最大1分遅れる。
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
  });
}
