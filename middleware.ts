import { NextResponse, type NextRequest } from "next/server";
import { createStaticClient } from "@/lib/supabase/static";

const COOKIE_NAME = "luxela_preview_auth";

// インスタ・X等での共有を想定した短縮ハンドル(/@AB12CD)。cast_code
// (00047_cast_short_code.sqlで自動採番済みの6桁コード)をそのまま使う。
// リダイレクトではなくrewriteにするのは、開いた後もアドレスバーが
// 短いURLのまま(/cast/<UUID>に変わらない)にするため。
const HANDLE_PATTERN = /^\/@([A-Za-z0-9]+)$/;

async function rewriteHandle(request: NextRequest): Promise<NextResponse | null> {
  const match = request.nextUrl.pathname.match(HANDLE_PATTERN);
  if (!match) return null;

  const supabase = createStaticClient();
  const { data: cast } = await supabase
    .from("cast_members")
    .select("id")
    .eq("cast_code", match[1].toUpperCase())
    .maybeSingle();

  if (!cast) return null; // 該当ハンドル無し。マッチするルートも無いので通常の404になる。

  const url = request.nextUrl.clone();
  url.pathname = `/cast/${cast.id}`;
  return NextResponse.rewrite(url);
}

// 公開ローンチ前、サイト全体を合言葉で隠すための入口ゲート。
// /api(cron・LINEコールバック等)と静的アセット、ゲート自身は対象外にして壊さないようにする。
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/gate") ||
    pathname.startsWith("/api") ||
    // OAuth/PKCEのcode交換とLINEの認証完了処理は、
    // セッションCookieを確立する前にゲートへ戻してはいけない。
    pathname.startsWith("/auth") ||
    pathname.startsWith("/embed") ||
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
