import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createStaticClient } from "@/lib/supabase/static";
import { photoText } from "@/lib/photo/serverText";

/**
 * 投稿画面の「ほかに紹介した店舗」の検索。店名(部分一致)で公開中の店舗を最大8件返す。
 * 店舗の名前とエリアだけの公開情報だが、荒らし・総当たり対策としてログイン中の会員だけが使える。
 */
export async function GET(request: NextRequest) {
  const { t } = await photoText();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: t.apiLoginRequired }, { status: 401 });

  // ilikeのワイルドカードと、PostgRESTの区切り文字になる文字は入力から外す。
  const q = (request.nextUrl.searchParams.get("q") ?? "").replace(/[%_,()\\*]/g, " ").trim().slice(0, 40);
  if (q.length < 1) return NextResponse.json({ shops: [] });

  const db = createStaticClient();
  const { data } = await db
    .from("locapass_shops")
    .select("id, name, area, portal:locapass_portals ( name )")
    .eq("status", "active")
    .ilike("name", `%${q}%`)
    .order("name")
    .limit(8);
  const shops = (data ?? []).map((s) => {
    const portal = Array.isArray(s.portal) ? s.portal[0] : s.portal;
    return { id: s.id, name: s.name, area: s.area, portalName: portal?.name ?? null };
  });
  return NextResponse.json({ shops });
}
