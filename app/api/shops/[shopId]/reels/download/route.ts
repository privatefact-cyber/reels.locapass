import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { zipStream, type ZipEntry } from "@/lib/reels/zipStream";
import { extensionOf, reelFileUrls } from "@/lib/reels/downloadable";

export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 1つのZIPに入れる投稿の数。大きすぎるとZIPが4GBを超えたり、関数の実行時間に収まらないので、分けてダウンロードしてもらう。 */
export const REELS_PER_ZIP = 30;

/**
 * 店舗のリール(店舗アカウント・FACES・スタッフが投稿したもの全部)を、ZIPにまとめてダウンロードする。
 * 解約・移行のときに、店舗が自分の投稿を持ち出せるようにするためのもの。?part=1,2,... で分けて取る(1つ30投稿まで)。
 * 呼べるのは、その店舗の管理者(shop_admin)・担当ポータルの管理者・運営者だけ(DBの locapass_is_shop_admin と同じ判定)。
 * ダミー(イメージ映像)は含めない。ZIPは無圧縮で、受け取った分をそのまま流す(メモリにためない)。
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  if (!UUID.test(shopId)) return NextResponse.json({ error: "不正なIDです" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  const { data: canManage } = await supabase.rpc("locapass_is_shop_admin", { p_shop_id: shopId });
  if (!canManage) return NextResponse.json({ error: "この操作をする権限がありません" }, { status: 403 });

  const part = Math.max(1, Number(request.nextUrl.searchParams.get("part") ?? 1) || 1);
  const admin = createAdminClient();
  const { data: shop } = await admin.from("locapass_shops").select("name").eq("id", shopId).maybeSingle();
  const { data: rows } = await admin
    .from("locapass_reels")
    .select("id, caption, video_url, images, published_at, updated_at")
    .eq("shop_id", shopId)
    .eq("is_placeholder", false)
    .order("published_at", { ascending: true, nullsFirst: true });

  const reels = (rows ?? []).filter((r) => reelFileUrls(r).length > 0);
  const slice = reels.slice((part - 1) * REELS_PER_ZIP, part * REELS_PER_ZIP);
  if (slice.length === 0) return NextResponse.json({ error: "ダウンロードできるリールがありません" }, { status: 404 });

  async function* entries(): AsyncGenerator<ZipEntry> {
    for (const reel of slice) {
      const urls = reelFileUrls(reel);
      const when = new Date(reel.published_at ?? reel.updated_at ?? Date.now());
      const day = when.toISOString().slice(0, 10);
      for (let i = 0; i < urls.length; i++) {
        const upstream = await fetch(urls[i]).catch(() => null);
        if (!upstream || !upstream.ok || !upstream.body) continue; // 取れなかった1件のために全体を止めない
        const suffix = urls.length > 1 ? `-${i + 1}` : "";
        yield { name: `${day}-${reel.id.slice(0, 8)}${suffix}.${extensionOf(urls[i])}`, modified: when, body: upstream.body };
      }
    }
  }

  const safeName = (shop?.name ?? "shop").replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 40);
  const fileName = `${safeName}-reels-part${part}.zip`;
  return new Response(zipStream(entries()), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="reels-part${part}.zip"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
