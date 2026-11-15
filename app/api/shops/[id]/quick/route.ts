import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildShopFacts } from "@/lib/shop/askShopAi";
import { buildQuickAnswer, type QuickKey } from "@/lib/shop/aiQuick";
import { makeNav } from "@/lib/shop/aiNav";

// 店舗AIの「雛形カード」の答え。AIは一切呼ばない(原価0円)。DBと、店舗が確認(OK)した資料から整えて、そのまま返す。
// 回数の制限には数えない。結果は、店舗・カード・言語が同じなら誰でも同じなので、CDNに短く保存して、DBへの負荷も抑える。
export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEYS: QuickKey[] = ["today", "price", "access", "events"];

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: shopId } = await params;
  if (!UUID_PATTERN.test(shopId)) return NextResponse.json({ error: "not-found" }, { status: 404 });
  const key = request.nextUrl.searchParams.get("key") as QuickKey | null;
  const lang = request.nextUrl.searchParams.get("lang") === "ja" ? "ja" : "en";
  if (!key || !KEYS.includes(key)) return NextResponse.json({ error: "bad-request" }, { status: 400 });

  const admin = createAdminClient() as any;
  const { data: shop } = await admin.from("locapass_shops").select("id, ai_chat_enabled").eq("id", shopId).eq("status", "active").maybeSingle();
  if (!shop || !shop.ai_chat_enabled) return NextResponse.json({ error: "not-found" }, { status: 404 });
  const facts = await buildShopFacts(shopId);
  if (!facts) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const { navForKey } = makeNav(facts);
  const sectionKey = key === "events" ? "price" : key;
  const link = navForKey(sectionKey);
  return NextResponse.json(
    { answer: buildQuickAnswer(facts.data, key, lang), nav: null, choices: link ? [{ key: sectionKey, nav: link }] : [] },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
