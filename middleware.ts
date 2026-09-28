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

// 公開ローンチに伴い、合言葉での入口ゲートは解除済み(旧/gateページは未リンクのまま残置)。
// ここでは短縮ハンドル(/@AB12CD)のrewriteのみ行う。
export async function middleware(request: NextRequest) {
  const handleRewrite = await rewriteHandle(request);
  return handleRewrite ?? NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
