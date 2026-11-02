import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extensionOf, reelFileUrls } from "@/lib/reels/downloadable";

export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES: Record<string, string> = { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/**
 * リール1件のダウンロード(動画、または複数枚の写真のうち ?i= 番目)。
 * 呼べるのは、そのリールの店舗の管理者(店舗・担当ポータル・運営者)と、投稿した本人(created_by)。
 * 画面のボタンの出し分けは見た目だけで、権限の確認はここで行う。
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "不正なIDです" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const admin = createAdminClient();
  const { data: reel } = await admin
    .from("locapass_reels")
    .select("id, shop_id, created_by, video_url, images, published_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (!reel) return NextResponse.json({ error: "見つかりません" }, { status: 404 });

  let allowed = reel.created_by === user.id;
  if (!allowed && reel.shop_id) {
    const { data } = await supabase.rpc("locapass_is_shop_admin", { p_shop_id: reel.shop_id });
    allowed = data === true;
  }
  if (!allowed) return NextResponse.json({ error: "この操作をする権限がありません" }, { status: 403 });

  const urls = reelFileUrls(reel);
  const url = urls[Math.max(0, Number(request.nextUrl.searchParams.get("i") ?? 0) || 0)];
  if (!url) return NextResponse.json({ error: "ダウンロードできるファイルがありません" }, { status: 404 });
  const upstream = await fetch(url).catch(() => null);
  if (!upstream || !upstream.ok || !upstream.body) return NextResponse.json({ error: "ファイルがありません" }, { status: 404 });

  const ext = extensionOf(url);
  const day = new Date(reel.published_at ?? reel.updated_at ?? Date.now()).toISOString().slice(0, 10);
  const headers: Record<string, string> = {
    "Content-Type": TYPES[ext] ?? "application/octet-stream",
    "Content-Disposition": `attachment; filename="locapass-${day}-${id.slice(0, 8)}.${ext}"`,
    "Cache-Control": "private, no-store",
  };
  const length = upstream.headers.get("content-length");
  if (length) headers["Content-Length"] = length;
  return new Response(upstream.body, { headers });
}
