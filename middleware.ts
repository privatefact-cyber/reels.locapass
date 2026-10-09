import { NextResponse, type NextRequest } from "next/server";
import { createStaticClient } from "@/lib/supabase/static";
import { castPath } from "@/lib/locapass/publicUrls";

// インスタ・X等での共有を想定した短縮ハンドル(/@AB12CD)。cast_code
// (locapass_cast_membersの一意な6桁コード)をそのまま使う。
// リダイレクトではなくrewriteにするのは、開いた後もアドレスバーが
// 短いURLのまま(/{portalSlug}/cast/{shopSlug}-{発行番号}に変わらない)にするため。
//
// 過去、このテーブル名が別プロダクト(LUXELA)の"cast_members"になっており、
// locapass側のコードが常にヒットしない状態になっていた。
const HANDLE_PATTERN = /^\/@([A-Za-z0-9]+)$/;

async function rewriteHandle(request: NextRequest): Promise<NextResponse | null> {
  const match = request.nextUrl.pathname.match(HANDLE_PATTERN);
  if (!match) return null;

  // locapass_cast_membersは個人情報列を含みRLSでanon読み取りを塞いでいるため、
  // 公開安全なビュー(locapass_public_casts)から引く。
  const supabase = createStaticClient();
  const { data: cast } = await supabase
    .from("locapass_public_casts")
    .select("issue_no, shop:locapass_shops ( slug, portal:locapass_portals ( slug ) )")
    .eq("cast_code", match[1].toUpperCase())
    .maybeSingle();

  const shop = cast ? (Array.isArray(cast.shop) ? cast.shop[0] : cast.shop) : null;
  const portal = shop ? (Array.isArray(shop.portal) ? shop.portal[0] : shop.portal) : null;

  if (!cast || !shop || !portal) return null; // 該当ハンドル無し。マッチするルートも無いので通常の404になる。

  const url = request.nextUrl.clone();
  url.pathname = castPath(portal.slug, shop.slug, cast.issue_no!);
  return NextResponse.rewrite(url);
}

// 合言葉ゲート(2026-09-30再導入、2026-10-07に既定でオフ)。パスワードは /gate で入力し、通るとCookieが付く。
// 環境変数 PREVIEW_GATE=on を設定して再デプロイすると、またゲートが有効になる(コードはそのまま残してある)。
// ゲートが有効なとき、/api(cron・LINEコールバック等)と静的アセット、ゲート自身は対象外にして壊さない。
// ただし /api/place-photo は課金APIに繋がるため、ゲートの内側に置く(公開中は、API側の1日上限とCDNキャッシュで抑える)。
const COOKIE_NAME = "luxela_preview_auth";
const GATE_ENABLED = process.env.PREVIEW_GATE === "on";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!GATE_ENABLED) {
    return (await rewriteHandle(request)) ?? NextResponse.next();
  }

  if (
    pathname.startsWith("/gate") ||
    (pathname.startsWith("/api") && !pathname.startsWith("/api/place-photo")) ||
    // OAuth/PKCEのcode交換とLINEの認証完了処理は、
    // セッションCookieを確立する前にゲートへ戻してはいけない。
    pathname.startsWith("/auth") ||
    pathname.startsWith("/embed") ||
    pathname.startsWith("/lp/") ||
    pathname === "/favicon.ico" ||
    // ブラウザのタブ・ホーム画面用アイコン(app/icon.png, app/apple-icon.png)。
    pathname === "/icon.png" ||
    pathname === "/apple-icon.png" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/webauth.html"
  ) {
    return NextResponse.next();
  }

  const authed = request.cookies.get(COOKIE_NAME)?.value === "1";
  if (authed) {
    const handleRewrite = await rewriteHandle(request);
    return handleRewrite ?? NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/gate";
  url.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
