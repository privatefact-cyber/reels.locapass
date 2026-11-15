import { createHmac } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { askShopAi, buildShopFacts, contentHash, isRelatedQuestion } from "@/lib/shop/askShopAi";
import { buildQuickAnswer, detectRule, isVolatileQuestion, normalizeQuestion, quickGreeting } from "@/lib/shop/aiQuick";
import { makeNav } from "@/lib/shop/aiNav";

// 店舗AI質問(有料オプション)。オンの店舗だけ。その店の登録情報だけで答える。
//
// 費用の防御(上から順に、AIを呼ばずに済むものは、そこで答える):
//   1. ルール判定 : 短く定番の質問(料金・営業時間・今日の出勤・電話・予約・在籍一覧など)は、DBから整えて即答(0円・回数に数えない)。
//   2. 回答キャッシュ: 同じ質問に、店舗の情報が変わらない間は、保存した回答を返す(0円・回数に数えない)。
//   3. 回数の制限 : ここから先は、AIを呼ぶ。1日の回数を、カウンター表に1回書き込んで数える(超えたら、案内と予約ボタンを返す)。
//   4. 無関係の質問のガード: 軽量モデルで、ごく短く判定(約0.002円)。無関係なら、本体のAIを呼ばずに案内する。
//   5. 本体のAI。
export const runtime = "nodejs";
export const maxDuration = 30;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|monitor|curl|wget|python|httpclient|headless|lighthouse|pingdom|uptime/i;
const MAX_QUESTION = 200;
/** AIを呼ぶ自由入力の、1日の回数の上限。店舗の上限は、店舗ごとの列(ai_daily_limit)で変えられる(将来、有料プランごとに)。 */
const VISITOR_DAILY_LIMIT = 15;
const VISITOR_SHOP_DAILY_LIMIT = 10;
const DEFAULT_SHOP_DAILY_LIMIT = 400;

const T = {
  ja: {
    limited: "現在AIコンシェルジュへのご質問が混み合っております。上記の『雛形カード』からのご確認、または下のボタンから直接の空席確認・ご予約をご利用ください!",
    unrelated: "このお店についてのご質問をお待ちしております。営業時間・料金・今日のFACES・予約など、下のカードからも確認できます。",
    none: "その情報はまだ登録されていません。",
    call: "お電話の画面をお開きします。",
    contact: "予約・ご連絡の画面をお開きします。日時などは、開いた画面でご連絡ください。",
    cast: "在籍FACESの一覧をお開きします。",
    reels: "リールをお開きします。",
  },
  en: {
    limited: "The AI concierge is very busy right now. Please use the quick cards above, or the buttons below to check availability and reserve directly!",
    unrelated: "Please ask me about this venue — hours, prices, who the FACES are today, reservations. You can also tap a card below.",
    none: "That information isn't registered yet.",
    call: "Opening the phone screen.",
    contact: "Opening the contact screen. Please send the date and details there.",
    cast: "Opening the FACES list.",
    reels: "Opening the reels.",
  },
} as const;

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
  const t = lang === "ja" ? T.ja : T.en;

  const admin = createAdminClient() as any;
  // オプションがオンの店舗だけ(オフ・存在しない店舗は区別せず404)。
  const { data: shop } = await admin.from("locapass_shops").select("id, ai_chat_enabled, ai_daily_limit").eq("id", shopId).eq("status", "active").maybeSingle();
  if (!shop || !shop.ai_chat_enabled) return NextResponse.json({ error: "not-found" }, { status: 404 });
  const facts = await buildShopFacts(shopId);
  if (!facts) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const visitor = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").update(`${ip}|${ua}|${day}`).digest("hex").slice(0, 24);
  const { navForKey, allChoices } = makeNav(facts);

  const log = (answer: string, source: string, extra: Record<string, unknown> = {}) =>
    admin.from("locapass_shop_ai_chats").insert({ shop_id: shopId, question, answer, lang, visitor_hash: visitor, source, ...extra }).then(undefined, () => undefined);
  const reply = (answer: string, source: string, nav: ReturnType<typeof navForKey> = null, choices: ReturnType<typeof allChoices> = [], extra: Record<string, unknown> = {}) => {
    void log(answer, source, extra);
    return NextResponse.json({ answer, nav, choices });
  };

  const norm = normalizeQuestion(question);

  // 1. ルール判定(0円・回数に数えない)
  const rule = detectRule(norm);
  if (rule) {
    if (rule.kind === "greeting") return reply(quickGreeting(lang), "rule", null, allChoices());
    if (rule.kind === "quick") {
      const answer = buildQuickAnswer(facts.data, rule.key, lang);
      const sectionKey = rule.key === "events" ? "price" : rule.key;
      const link = navForKey(sectionKey);
      return reply(answer, "rule", null, link ? [{ key: sectionKey, nav: link }] : []);
    }
    const nav = navForKey(rule.target);
    if (!nav) return reply(t.none, "rule", null, allChoices());
    return reply(t[rule.target], "rule", nav);
  }

  // 2. 回答キャッシュ(0円・回数に数えない)。時間で答えが変わる質問は、保存しない。
  const volatile = isVolatileQuestion(norm);
  const hash = contentHash(facts);
  if (!volatile) {
    const { data: hit } = await admin.from("shop_ai_answer_cache").select("response, hits").eq("shop_id", shopId).eq("norm_question", norm).eq("content_hash", hash).maybeSingle();
    const r = hit?.response as { answer?: string; answerable?: boolean; action?: string; target?: string | null } | undefined;
    if (r?.answer) {
      void admin.from("shop_ai_answer_cache").update({ hits: (hit.hits ?? 0) + 1, last_hit_at: new Date().toISOString() }).eq("shop_id", shopId).eq("norm_question", norm).eq("content_hash", hash).then(undefined, () => undefined);
      const nav = r.action === "reserve" ? navForKey("contact") : r.action === "call" ? navForKey("call") : r.action === "goto" && r.target ? navForKey(r.target) : null;
      const choices = !nav && (r.answerable === false || (r.action && r.action !== "none")) ? allChoices() : [];
      return reply(r.answer, "cache", nav, choices, { answerable: r.answerable !== false });
    }
  }

  // 3. 回数の制限(ここから先は、AIを呼ぶ)。1回の書き込みで、端末・端末×店舗・店舗の3つを数える。
  const { data: quota } = await admin.rpc("ai_take_quota", {
    p_day: day,
    p_shop: shopId,
    p_visitor: visitor,
    p_visitor_limit: VISITOR_DAILY_LIMIT,
    p_visitor_shop_limit: VISITOR_SHOP_DAILY_LIMIT,
    p_shop_limit: typeof shop.ai_daily_limit === "number" && shop.ai_daily_limit > 0 ? shop.ai_daily_limit : DEFAULT_SHOP_DAILY_LIMIT,
  });
  if (quota && quota !== "ok") {
    // エラー表示にはしない。チャットの中で、案内と、予約・電話のボタンを出す。
    return NextResponse.json({ answer: t.limited, nav: null, choices: allChoices(), limited: true });
  }
  if (Math.random() < 0.002) void admin.rpc("ai_purge_old", { p_day: day }).then(undefined, () => undefined);

  // 4. 無関係な質問のガード(軽量モデル)
  if (!(await isRelatedQuestion(facts, question))) return reply(t.unrelated, "gate", null, allChoices());

  // 5. 本体のAI
  const result = await askShopAi(facts, question, lang);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.reason === "busy" ? 503 : 500 });

  if (!volatile) {
    void admin
      .from("shop_ai_answer_cache")
      .upsert({ shop_id: shopId, norm_question: norm, content_hash: hash, response: { answer: result.answer, answerable: result.answerable, action: result.action, target: result.target } }, { onConflict: "shop_id,norm_question,content_hash" })
      .then(undefined, () => undefined);
  }
  void log(result.answer, "gemini", { answerable: result.answerable, prompt_tokens: result.usage.promptTokens, cached_tokens: result.usage.cachedTokens, output_tokens: result.usage.outputTokens });

  let nav: ReturnType<typeof navForKey> = null;
  if (result.action === "reserve") nav = navForKey("contact");
  else if (result.action === "call") nav = navForKey("call");
  else if (result.action === "goto" && result.target) nav = navForKey(result.target);
  // 該当の機能が無くて答えられなかったとき(動かす先も無いとき)は、その店舗で使える画面のカードを出して選んでもらう。
  const choices = !nav && (!result.answerable || result.action !== "none") ? allChoices() : [];
  return NextResponse.json({ answer: result.answer, nav, choices });
}
