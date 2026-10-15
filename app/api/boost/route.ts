import { NextResponse } from "next/server";
import { getActiveBoosts } from "@/lib/boost/getBoosts";
import { createStaticClient } from "@/lib/supabase/static";

export const dynamic = "force-dynamic";

/** ?portal=スラッグ で子ポータルに所属する店舗のブーストだけ。省略(グランドトップ)は全件。 */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("portal");
  let portalId: number | null = null;
  if (slug) {
    const { data } = await createStaticClient().from("locapass_portals").select("id").eq("slug", slug).maybeSingle();
    if (!data) return NextResponse.json({ items: [] }, { headers: { "Cache-Control": "no-store" } });
    portalId = data.id;
  }
  const items = await getActiveBoosts(portalId);
  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}
