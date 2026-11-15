import { createHmac } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopPath, shopReelsPath } from "@/lib/locapass/publicUrls";
import { askShopAi, buildShopFacts } from "@/lib/shop/askShopAi";
import { resolveReservation } from "@/lib/shop/reservation";

// 店舗AI質問(有料オプション)。オンの店舗だけ。その店の登録情報だけで答える。
export const runtime = "nodejs";
export const maxDuration = 30;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|monitor|curl|wget|python|httpclient|headless|lighthouse|pingdom|uptime/i;
const MAX_QUESTION = 200;
/**
 * 1人(端末)が1日に聞ける回数と、1店舗が1日に受ける回数の上限。
 * 有料オプションなので、通常の利用では届かない高さにしてある。目的は、プログラムの暴走や悪意のある連続送信で、
 * AIの利用料が青天井にならないようにする安全装置(1回の質問は、約0.2〜0.7円。最悪でも1店舗で1日1,000円ほど)。
 */
const VISITOR_DAILY_LIMIT = 100;
const SHOP_DAILY_LIMIT = 1500;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: shopId } = await params;
  if (!UUID_PATTERN.test(shopId)) return NextResponse.json({ error: "not-found" }, { status: 404 });
  const ua = request.headers.get("user-agent") ?? "";
  if (!ua || BOT.test(ua)) return NextResponse.json({ error: "not-allowed" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { question?: unknown; lang?: unknown } | null;
  const question = typeof body?.question === "string" ? body.question.replace(/\s+/g, " ").trim() : "";
  if (!question) return NextResponse.json({ error: "empty" }, { status: 400 });
  if (question.length > MAX_QUESTION) return NextResponse.json({ error: "too-long" }, { status: 400 });
  const lang = typeof body?.lang === "string" ? body.lang.slice(0, 8) : "ja";

  const admin = createAdminClient() as any;
  // オプションがオンの店舗だけ(オフ・存在しない店舗は区別せず404)。
  const { data: shop } = await admin.from("locapass_shops").select("id, ai_chat_enabled").eq("id", shopId).eq("status", "active").maybeSingle();
  if (!shop || !shop.ai_chat_enabled) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const visitor = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").update(`${ip}|${ua}|${day}`).digest("hex").slice(0, 24);
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [{ count: visitorCount }, { count: shopCount }] = await Promise.all([
    admin.from("locapass_shop_ai_chats").select("id", { count: "exact", head: true }).eq("visitor_hash", visitor).gte("created_at", since),
    admin.from("locapass_shop_ai_chats").select("id", { count: "exact", head: true }).eq("shop_id", shopId).gte("created_at", since),
  ]);
  if ((visitorCount ?? 0) >= VISITOR_DAILY_LIMIT) return NextResponse.json({ error: "visitor-limit" }, { status: 429 });
  if ((shopCount ?? 0) >= SHOP_DAILY_LIMIT) return NextResponse.json({ error: "shop-limit" }, { status: 429 });

  const facts = await buildShopFacts(shopId);
  if (!facts) return NextResponse.json({ error: "not-found" }, { status: 404 });
  const result = await askShopAi(facts, question, lang);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.reason === "busy" ? 503 : 500 });

  // 記録は答えられたものだけ。失敗しても答えは返す。
  await admin.from("locapass_shop_ai_chats").insert({ shop_id: shopId, question, answer: result.answer, lang, visitor_hash: visitor, answerable: result.answerable, prompt_tokens: result.usage.promptTokens, cached_tokens: result.usage.cachedTokens, output_tokens: result.usage.outputTokens }).then(undefined, () => undefined);
  // 画面を動かす先(店舗ページの該当の場所・連絡の画面・電話)。予約の確定はお客様が行う(AIは確定しない)。
  type Nav = { kind: "reserve" | "goto" | "call"; path?: string; hash?: string; contact?: boolean; href?: string };
  const base = shopPath(facts.portalSlug, facts.slug);
  const reservation = resolveReservation({ shopId, plan: facts.plan, phone: facts.phone, lineUrl: facts.lineUrl, bookingUrl: facts.bookingUrl });
  const navForKey = (key: string): Nav | null => {
    if (key === "cast" || key === "today" || key === "price" || key === "access") return facts.sections[key] ? { kind: "goto", path: base, hash: key } : null;
    if (key === "reels") return facts.sections.reels ? { kind: "goto", path: shopReelsPath(facts.portalSlug, facts.slug) } : null;
    if (key === "call") return facts.phone ? { kind: "call", href: `tel:${facts.phone}` } : null;
    if (key === "contact") {
      if (!reservation) return null;
      if (reservation.mode === "priority") return { kind: "reserve", path: reservation.path }; // サイト内の優先予約ページ(日時を選んで確定する)
      if (reservation.mode === "external_url") return { kind: "reserve", href: reservation.url }; // 店舗の予約ページ
      return { kind: "reserve", path: base, contact: true }; // 電話・LINEの連絡画面
    }
    return null;
  };
  let nav: Nav | null = null;
  if (result.action === "reserve") nav = navForKey("contact");
  else if (result.action === "call") nav = navForKey("call");
  else if (result.action === "goto" && result.target) nav = navForKey(result.target);

  // 該当の機能が無くて答えられなかったとき(動かす先も無いとき)は、その店舗で使える画面のカードを出して選んでもらう。
  const choices =
    !nav && (!result.answerable || result.action !== "none")
      ? (["cast", "today", "price", "access", "reels", "call", "contact"] as const).flatMap((key) => {
          const n = navForKey(key);
          return n ? [{ key, nav: n }] : [];
        })
      : [];
  return NextResponse.json({ answer: result.answer, nav, choices });
}
