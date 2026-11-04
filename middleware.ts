import { NextResponse, type NextRequest } from "next/server";
import { createStaticClient } from "@/lib/supabase/static";
import { castPath } from "@/lib/locapass/publicUrls";
import { isLocale, type Locale } from "@/lib/i18n/locale";
import { LOCALE_HEADER, PUBLIC_PATH_HEADER, isLocalizablePath, splitLocalePrefix } from "@/lib/i18n/localePath";

// インスタ・X等での共有を想定した短縮ハンドル(/@AB12CD)。cast_code
// (locapass_cast_membersの一意な6桁コード)をそのまま使う。
// リダイレクトではなくrewriteにするのは、開いた後もアドレスバーが
// 短いURLのまま(/{portalSlug}/cast/{shopSlug}-{発行番号}に変わらない)にするため。
//
// 過去、このテーブル名が別プロダクト(LUXELA)の"cast_members"になっており、
// locapass側のコードが常にヒットしない状態になっていた。
const HANDLE_PATTERN = /^\/@([A-Za-z0-9]+)$/;

async function resolveHandle(pathname: string): Promise<string | null> {
  const match = pathname.match(HANDLE_PATTERN);
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
  return castPath(portal.slug, shop.slug, cast.issue_no!);
}

// 公開ページの言語別URL(lib/i18n/localePath.ts)。/en /zh /ar の接頭辞を外して今のルートへ内部rewriteし、
// 言語と接頭辞なしのパスをリクエストヘッダーで渡す(getServerLocale / ルートlayoutのhreflangが読む)。
// 接頭辞なしの公開ページは常に日本語(x-locale=ja)。管理画面・マイページ等の対象外パスはヘッダーを付けず、従来どおりCookieで決まる。
// /api は、呼び出し元のページと同じ言語で返す(?lang= > 呼び出し元ページのURL(Referer) > Cookie)。
function apiLocale(request: NextRequest): Locale | null {
  const lang = request.nextUrl.searchParams.get("lang");
  if (isLocale(lang)) return lang;
  const referer = request.headers.get("referer");
  if (!referer) return null;
  try {
    const from = new URL(referer);
    if (from.host !== request.nextUrl.host) return null;
    const { locale, path } = splitLocalePrefix(from.pathname);
    // 管理画面・マイページ等から呼ばれたときは、従来どおりCookieで決める
    return isLocalizablePath(path) ? (locale ?? "ja") : null;
  } catch {
    return null;
  }
}

async function routeLocale(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const { locale: prefixed, path } = splitLocalePrefix(pathname);

  // 対象外パスに接頭辞が付いて来たら、接頭辞なしへ移す(言語別URLは公開ページだけ)。
  if (prefixed && !isLocalizablePath(path)) {
    const url = request.nextUrl.clone();
    url.pathname = path;
    return NextResponse.redirect(url);
  }

  const requestHeaders = new Headers(request.headers);
  // 外から送られてきた同名ヘッダーは使わない
  requestHeaders.delete(LOCALE_HEADER);
  requestHeaders.delete(PUBLIC_PATH_HEADER);

  let locale: Locale | null = null;
  if (isLocalizablePath(path)) {
    locale = prefixed ?? "ja";
  } else if (path.startsWith("/api/")) {
    locale = apiLocale(request);
  }
  if (locale) requestHeaders.set(LOCALE_HEADER, locale);
  if (isLocalizablePath(path)) requestHeaders.set(PUBLIC_PATH_HEADER, path);

  const handleTarget = await resolveHandle(path);
  const target = handleTarget ?? path;
  if (target !== pathname) {
    const url = request.nextUrl.clone();
    url.pathname = target;
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

// 合言葉ゲート(2026-09-30再導入、2026-10-07に既定でオフ)。パスワードは /gate で入力し、通るとCookieが付く。
// 環境変数 PREVIEW_GATE=on を設定して再デプロイすると、またゲートが有効になる(コードはそのまま残してある)。
// ゲートが有効なとき、/api(cron・LINEコールバック等)と静的アセット、ゲート自身は対象外にして壊さない。
// ただし /api/place-photo は課金APIに繋がるため、ゲートの内側に置く(公開中は、API側の1日上限とCDNキャッシュで抑える)。
const COOKIE_NAME = "luxela_preview_auth";
const GATE_ENABLED = process.env.PREVIEW_GATE === "on";

export async function middleware(request: NextRequest) {
  const { path: pathname } = splitLocalePrefix(request.nextUrl.pathname);

  if (!GATE_ENABLED) {
    return routeLocale(request);
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
    return routeLocale(request);
  }

  const authed = request.cookies.get(COOKIE_NAME)?.value === "1";
  if (authed) {
    return routeLocale(request);
  }

  const url = request.nextUrl.clone();
  url.pathname = "/gate";
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
