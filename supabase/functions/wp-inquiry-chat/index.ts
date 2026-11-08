// wp-inquiry-chat: WPサイトの問い合わせウィジェットから呼ばれるエンドポイント。
// AI推論はn8n(既存の「アル」と同じ運用)に委譲し、ここでは認証・DB管理・中継のみ行う。
import { createClient } from "jsr:@supabase/supabase-js@2";
import { narrowKbDocs } from "./retrieval.ts";
import { loadShopAttributeLines } from "../_shared/shopAttributes.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_KB_CHARS = 40000;
const MAX_HISTORY_MESSAGES = 20;
const DIGEST_EVERY_N_TURNS = 5;
const GEMINI_MODEL = "gemini-2.5-flash";
const LOCAPASS_NETWORK_ROOT_DOMAIN = "locapass.net";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stripAdminPrefix(title: string): string {
  return title.replace(/^[\[［【].*?[\]］】]\s*/u, "").trim();
}

function formatJstNow(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  return parts;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 混雑状況(occupancy_status)の撮影何分前かを人間向けテキストに変換する。
// luxela.jpはshops.occupancy_status、locapass.net系はlocapass_shops.occupancy_status を
// 店舗ダッシュボード/管理コンソールのフロア写真アップロード機能(2026-09-19追加)が
// Gemini判定結果を保存している列。ここではDBの生データをAIへの参照テキストに整形するだけ。
const OCCUPANCY_LABEL: Record<string, string> = {
  available: "空席あり",
  few_seats: "残りわずか",
  full: "満席",
};

type OccupancyStatus = {
  status: string;
  estimated_available_seats: number | null;
  captured_at: string;
} | null;

function formatOccupancyMinutesAgo(capturedAt: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(capturedAt).getTime()) / 60000));
  if (minutes < 1) return "1分未満前";
  if (minutes < 60) return `${minutes}分前`;
  return `${Math.round(minutes / 60)}時間前`;
}

function occupancyContentSuffix(occ: OccupancyStatus): string {
  if (!occ) return "";
  const minutesText = formatOccupancyMinutesAgo(occ.captured_at);
  const seatsText =
    typeof occ.estimated_available_seats === "number"
      ? `(推定空席数: ${occ.estimated_available_seats}席)`
      : "";
  const label = OCCUPANCY_LABEL[occ.status] ?? occ.status;
  return `\n混雑状況(${minutesText}時点): ${label}${seatsText}`;
}

// 画面で選択中の検索キーワード/ジャンルタグ。クライアント由来の値なので、長さ・個数を制限し、
// 改行や括弧など指示文を紛れ込ませられる文字を取り除いてからプロンプトに入れる。
function sanitizeTag(v: unknown, maxLen: number): string {
  if (typeof v !== "string") return "";
  return v.replace(/[\r\n\t【】\[\]{}<>`"\\]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, maxLen);
}

// 質問文の文字種から回答言語を決める。サイトの指示文が日本語なので、AI任せにすると日本語で
// 返してしまうことがある(アラビア語・中国語で確認済み)ため、日本語以外はコード側で言語を明示する。
// 日本語(かな含む)は null(指定なし)。ラテン文字は英語とは限らないので「質問と同じ言語」と指示する。
function detectReplyLanguage(text: string): string | null {
  if (/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/u.test(text)) return "アラビア語";
  if (/[\u3040-\u30FF]/u.test(text)) return null; // ひらがな・カタカナ → 日本語
  if (/[\uAC00-\uD7AF\u1100-\u11FF]/u.test(text)) return "韓国語";
  if (/[\u0E00-\u0E7F]/u.test(text)) return "タイ語";
  if (/[\u0400-\u04FF]/u.test(text)) return "ロシア語";
  if (/[\u0900-\u097F]/u.test(text)) return "ヒンディー語";
  if (/[\u4E00-\u9FFF]/u.test(text)) return "中国語";
  if (/[A-Za-z\u00C0-\u024F]{2,}/u.test(text)) return "質問と同じ言語(英語・ベトナム語・スペイン語など)";
  return null;
}

async function summarizeDigest(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
  previousDigest: string | null,
) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.warn("GEMINI_API_KEY not set; skipping digest summarization");
    return;
  }

  const { data: recentMessages } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY_MESSAGES);
  const ordered = (recentMessages ?? []).slice().reverse();
  if (ordered.length === 0) return;

  const transcript = ordered
    .map((m) => `${m.role === "ai" ? "bot" : "user"}: ${m.content}`)
    .join("\n");

  const prompt = `あなたは接客チャットボットの会話ログを要約する専用アシスタントです。
挨拶・相槌・雑談などのノイズは100%無視し、次の観点だけを日本語の箇条書きMarkdownで抽出してください。

- ユーザーの要望・困りごと
- ユーザーの好み・条件(エリア、予算、希望条件など)
- 既に提示済みの店舗名・情報
- その他、次回の会話で覚えておくべき事実

既存カルテがあれば新しい発言の内容で統合し、矛盾する場合は新しい情報を優先してください。
出力はカルテのMarkdown本文のみ。挨拶文・説明文・前置きは一切含めないでください。該当情報が無い項目は書かないか「(特になし)」としてください。

【既存カルテ】
${previousDigest?.trim() || "(なし)"}

【直近の会話ログ】
${transcript}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        }),
      },
    );
    if (!res.ok) {
      console.error("gemini digest call failed", res.status, await res.text());
      return;
    }
    const data = await res.json();
    const digest: string | undefined =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!digest || !digest.trim()) return;

    await supabase
      .from("conversations")
      .update({ digest_md: digest.trim(), digest_updated_at: new Date().toISOString() })
      .eq("id", conversationId);
  } catch (err) {
    console.error("digest summarization failed", err);
  }
}

// 街の声: 相手が「働き先」を探しているかの判定語(ベータ・精度は割り切り)。
const JOB_INTENT_RE = /働き|働く|働け|求人|体入|体験入店|バイト|アルバイト|時給|日給|面接|応募|キャスト募集|在籍したい|稼ぎ|稼げ|出稼ぎ|入店したい|キャバ嬢に/u;
// 調査ログの生データから「働く側の条件」の行だけを拾う語と、拾わない(ネガティブ)語。
const JOB_LINE_RE = /時給|日給|月給|体入|体験入店|保証|日払|バック|送り|寮|未経験|ドレス|ヘアメイク|入店祝|待遇|シフト|週\d|出勤/u;
const JOB_LINE_NG_RE = /警察|逮捕|摘発|検挙|事件|反社|暴力団|トラブル|ぼったくり|営業停止|行政処分|閉店|閉業|違法|詐欺|容疑|被害|炎上|悪評|最悪|危険|ノルマ|罰金|パワハラ|セクハラ/u;
const MAX_JOB_LINES_PER_SHOP = 4;

function extractJobLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.replace(/^[\s*\-・]+/u, "").trim())
    .filter((l) => l && JOB_LINE_RE.test(l) && !JOB_LINE_NG_RE.test(l))
    .map((l) => (l.length > 90 ? `${l.slice(0, 90)}…` : l))
    .slice(0, MAX_JOB_LINES_PER_SHOP);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  let body: {
    domain?: string;
    secret_key?: string;
    session_id?: string;
    message?: string;
    visitor_name?: string;
    visitor_contact?: string;
    current_area_slug?: string;
    user_lat?: number;
    user_lng?: number;
    selected_keyword?: string;
    selected_genres?: string[];
    // "machi_no_koe" … luxela.jpの「街の声ベータ版」タブから。未指定は通常のコンシェルジュ。
    mode?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const { domain, secret_key, session_id, message } = body;
  if (!domain || !secret_key || !session_id || !message) {
    return json({ error: "missing required fields" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "wp_inquiry" } },
  );
  const supabasePublic = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: site, error: siteError } = await supabase
    .from("sites")
    .select("*")
    .eq("domain", domain)
    .eq("secret_key", secret_key)
    .eq("is_active", true)
    .maybeSingle();

  if (siteError || !site) {
    return json({ error: "unauthorized" }, 401);
  }

  let customerId: string | null = null;
  let customerName: string | null = null;
  const authHeader = req.headers.get("authorization") ?? "";
  const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (bearerToken) {
    try {
      const { data: userData, error: userError } = await supabasePublic.auth.getUser(
        bearerToken,
      );
      const verifiedUser = userError ? null : userData?.user;
      if (verifiedUser) {
        const { data: profile } = await supabasePublic
          .from("user_profiles")
          .select("nickname")
          .eq("id", verifiedUser.id)
          .maybeSingle();
        customerName = profile?.nickname ?? null;

        const { data: customer, error: customerError } = await supabase
          .from("customers")
          .upsert(
            { site_id: site.id, auth_user_id: verifiedUser.id },
            { onConflict: "site_id,auth_user_id" },
          )
          .select("id")
          .single();
        if (!customerError && customer) {
          customerId = customer.id;
        }
      }
    } catch (err) {
      console.error("auth verification failed, falling back to anonymous", err);
    }
  }

  let { data: conversation } = await supabase
    .from("conversations")
    .select("*")
    .eq("site_id", site.id)
    .eq("session_id", session_id)
    .maybeSingle();

  if (!conversation) {
    const { data: created, error: createError } = await supabase
      .from("conversations")
      .insert({
        site_id: site.id,
        session_id,
        visitor_name: body.visitor_name ?? null,
        visitor_contact: body.visitor_contact ?? null,
        customer_id: customerId,
      })
      .select("*")
      .single();
    if (createError || !created) {
      return json({ error: "failed to create conversation" }, 500);
    }
    conversation = created;
  } else if (customerId && !conversation.customer_id) {
    await supabase
      .from("conversations")
      .update({ customer_id: customerId })
      .eq("id", conversation.id);
    conversation.customer_id = customerId;
  }

  if (conversation.status === "escalated") {
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "user",
      content: message,
    });
    return json({
      reply: "現在担当者が確認しております。少々お待ちください。",
      escalated: true,
    });
  }

  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    role: "user",
    content: message,
  });

  const newTurnCount = (conversation.turn_count ?? 0) + 1;
  await supabase
    .from("conversations")
    .update({ turn_count: newTurnCount })
    .eq("id", conversation.id);

  function coreNameFromTitle(title: string): string {
    const stripped = stripAdminPrefix(title);
    const chunks = stripped.split(/\s+/u).filter((c) => c.length >= 2);
    if (chunks.length === 0) return stripped;
    return chunks.reduce((a, b) => (b.length > a.length ? b : a));
  }

  const isLocapassNetworkDomain =
    site.domain === LOCAPASS_NETWORK_ROOT_DOMAIN ||
    site.domain.startsWith(`${LOCAPASS_NETWORK_ROOT_DOMAIN}/`);

  // 街の声ベータ版: luxela.jp限定、かつ管理画面のベータスイッチ(platform_settings)がオンのときだけ有効。
  // スイッチを切った後に古い画面から mode が送られてきても、通常のコンシェルジュとして扱う。
  let isMachiNoKoe = false;
  if (body.mode === "machi_no_koe") {
    // luxela.jp と locapass.net 系でスイッチは別(platform_settings の列が違う)。
    const flagColumn = isLocapassNetworkDomain ? "locapass_machi_no_koe_beta_enabled" : "machi_no_koe_beta_enabled";
    const { data: settings, error: settingsError } = await supabasePublic
      .from("platform_settings")
      .select(flagColumn)
      .eq("id", true)
      .maybeSingle();
    if (settingsError) console.error("platform_settings lookup failed", settingsError);
    isMachiNoKoe = Boolean((settings as Record<string, unknown> | null)?.[flagColumn]);
  }
  // 店舗URL → 街の噂ネタ(shops.sns_whisper。自動収集で客向けにポジティブだけ蒸留したもの/運営の手入力)。
  // 街の声モードではAIの店舗情報に「★街の噂ネタ」として渡し、提案の中で直接織り込ませる。
  const whisperByUrl = new Map<string, { text: string; updated_at: string | null }>();
  // 店舗URL → 店舗ID(街の声で提案した店の噂を裏で更新してもらうため)。
  const shopIdByUrl = new Map<string, string>();

  let kbDocs: { title: string; url: string; content: string }[] = [];
  let currentAreaName: string | null = null;
  let nearbyShopNames: string[] | null = null;
  // 店舗資料の絞り込み(検索)用。locapass.net系は portal_id で、それ以外は kb_documents のサイト単位で探す。
  let narrowScopeKey = `kb:${site.id}`;
  let narrowPortalId: number | null = null;

  if (isLocapassNetworkDomain) {
    const slug =
      site.domain === LOCAPASS_NETWORK_ROOT_DOMAIN
        ? null
        : site.domain.slice(LOCAPASS_NETWORK_ROOT_DOMAIN.length + 1);
    narrowScopeKey = "locapass";

    // 2026-09-20のRBAC改修で locapass_sites→locapass_portals、site_id→portal_id に改名済み。
    let shopsQuery = supabasePublic
      .from("locapass_shops")
      .select(
        "id, name, category, tagline, description, address, tel, business_hours, url, line_url, portal_id, lat, lng, occupancy_status, sns_whisper, sns_whisper_updated_at, is_temporarily_closed",
      )
      .eq("status", "active");

    if (slug) {
      const { data: portalRow, error: portalError } = await supabasePublic
        .from("locapass_portals")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (portalError) console.error("locapass_portals lookup failed", portalError);
      shopsQuery = portalRow ? shopsQuery.eq("portal_id", portalRow.id) : shopsQuery.eq("portal_id", -1);
      narrowPortalId = portalRow ? (portalRow.id as number) : -1;
    }

    const { data: shops, error: shopsError } = await shopsQuery.limit(2000);
    if (shopsError) console.error("locapass_shops query failed", shopsError);
    let shopsList = shops ?? [];

    if (!slug && typeof body.user_lat === "number" && typeof body.user_lng === "number") {
      const withDistance = shopsList
        .filter((s) => typeof s.lat === "number" && typeof s.lng === "number")
        .map((s) => ({
          ...s,
          __distanceKm: haversineKm(body.user_lat as number, body.user_lng as number, s.lat as number, s.lng as number),
        }))
        .sort((a, b) => a.__distanceKm - b.__distanceKm);

      if (withDistance.length > 0) {
        nearbyShopNames = withDistance.slice(0, 5).map((s) => s.name as string);
        const nearestIds = new Set(withDistance.map((s) => s.id));
        shopsList = [
          ...withDistance,
          ...shopsList.filter((s) => !nearestIds.has(s.id)),
        ];
      }
    } else if (!slug && body.current_area_slug) {
      const { data: areaPortal, error: areaError } = await supabasePublic
        .from("locapass_portals")
        .select("id, name")
        .eq("slug", body.current_area_slug)
        .maybeSingle();
      if (areaError) console.error("locapass_portals area lookup failed", areaError);
      if (areaPortal) {
        currentAreaName = (areaPortal.name as string) ?? null;
        const areaId = areaPortal.id;
        shopsList = [
          ...shopsList.filter((s) => s.portal_id === areaId),
          ...shopsList.filter((s) => s.portal_id !== areaId),
        ];
      }
    }

    // 店舗ダッシュボード/管理コンソールで撮った最新のフロア写真判定(occupancy_status)が
    // あれば、「空席あり」等をcontentに撮影何分前かと一緒に注入する。これで「空いてる?」系の
    // 質問に、n8n側のプロンプト変更なしでその場の情報を渡せる(2026-09-19、luxela.jpと同じ仕組み)。
    // 街の声: 営業停止・閉店の疑いが無い店舗の噂ネタを、kbDocsと同じURLをキーにして控えておく。
    // リンク先は常にロカパス上の店舗詳細ページにする。shop.url(店舗自身の公式サイト)を返すと、
    // 画面側はパス部分だけを使うため、外部サイトのトップ("/")=ロカパスのグランドトップに飛ばされてしまう。
    const locapassShopUrl = (shop: { id: unknown; url: unknown }) =>
      `https://locapass.net/shops/${shop.id}`;
    if (isMachiNoKoe) {
      for (const shop of shopsList) {
        if (!shop.is_temporarily_closed && typeof shop.sns_whisper === "string" && shop.sns_whisper.trim()) {
          whisperByUrl.set(locapassShopUrl(shop), {
            text: shop.sns_whisper.trim(),
            updated_at: (shop.sns_whisper_updated_at as string | null) ?? null,
          });
        }
      }
    }

    for (const shop of shopsList) shopIdByUrl.set(locapassShopUrl(shop), shop.id as string);

    // 属性(ペット同伴可・駐車場など)。オンの属性だけを「設備・条件」欄としてAIに渡す。
    // 欄が無い店は「なし」ではなく「未設定」(AIには、欄が無い=記載なし、と伝える)。
    const attributeLineByShop = await loadShopAttributeLines(supabasePublic);

    kbDocs = shopsList.map((shop) => ({
      title: shop.name as string,
      url: locapassShopUrl(shop),
      content:
        [
          shop.category ? `ジャンル: ${shop.category}` : null,
          attributeLineByShop.get(shop.id as string) ? `設備・条件タグ: ${attributeLineByShop.get(shop.id as string)}` : null,
          shop.tagline ? `一言: ${shop.tagline}` : null,
          shop.address ? `住所: ${shop.address}` : null,
          shop.tel ? `電話: ${shop.tel}` : null,
          shop.business_hours ? `営業時間: ${shop.business_hours}` : null,
          shop.description ? `紹介: ${shop.description}` : null,
          shop.line_url ? `LINE: ${shop.line_url}` : null,
        ]
          .filter(Boolean)
          .join("\n") + occupancyContentSuffix(shop.occupancy_status as OccupancyStatus),
    }));
  } else {
    const kbSiteIds = [site.id];
    const { data: kbDocsResult } = await supabase
      .from("kb_documents")
      .select("title, url, content")
      .in("site_id", kbSiteIds)
      .order("updated_at", { ascending: false });
    kbDocs = kbDocsResult ?? [];

    const uuidRe = /\/shops\/([0-9a-fA-F-]{36})/;
    for (const doc of kbDocs) {
      const shopId = doc.url.match(uuidRe)?.[1];
      if (shopId) shopIdByUrl.set(doc.url, shopId);
    }
    const candidateIds = kbDocs
      .map((doc) => doc.url.match(uuidRe)?.[1])
      .filter((id): id is string => Boolean(id));

    if (candidateIds.length > 0) {
      const { data: shopsWithExtras } = await supabasePublic
        .from("shops")
        .select("id, lat, lng, occupancy_status, sns_whisper, sns_whisper_updated_at, is_temporarily_closed")
        .in("id", candidateIds)
        .eq("status", "active");

      const extrasById = new Map<
        string,
        {
          lat?: number;
          lng?: number;
          occupancy_status?: OccupancyStatus;
        }
      >();
      for (const s of shopsWithExtras ?? []) {
        // 自動収集で「営業停止・閉店の疑い」と判定された店舗(is_temporarily_closed)には耳打ちしない。
        if (isMachiNoKoe && !s.is_temporarily_closed && typeof s.sns_whisper === "string" && s.sns_whisper.trim()) {
          const doc = kbDocs.find((d) => d.url.match(uuidRe)?.[1] === s.id);
          if (doc) {
            whisperByUrl.set(doc.url, {
              text: s.sns_whisper.trim(),
              updated_at: (s.sns_whisper_updated_at as string | null) ?? null,
            });
          }
        }
        extrasById.set(s.id as string, {
          lat: typeof s.lat === "number" ? s.lat : undefined,
          lng: typeof s.lng === "number" ? s.lng : undefined,
          occupancy_status: s.occupancy_status as OccupancyStatus,
        });
      }

      // 店舗ダッシュボードで撮った最新のフロア写真判定(occupancy_status)があれば、
      // 「空席あり」等をkb_documentsのcontentに撮影何分前かと一緒に注入する。
      // これで「空いてる?」系の質問に、n8n側のプロンプト変更なしでその場の情報を渡せる。
      kbDocs = kbDocs.map((doc) => {
        const shopId = doc.url.match(uuidRe)?.[1];
        const occ = shopId ? extrasById.get(shopId)?.occupancy_status : null;
        if (!occ) return doc;
        return {
          ...doc,
          content: `${doc.content}${occupancyContentSuffix(occ)}`,
        };
      });


      if (typeof body.user_lat === "number" && typeof body.user_lng === "number") {
        const withDistance = kbDocs
          .map((doc) => {
            const shopId = doc.url.match(uuidRe)?.[1];
            const c = shopId ? extrasById.get(shopId) : undefined;
            if (!c || typeof c.lat !== "number" || typeof c.lng !== "number") return null;
            return {
              doc,
              distanceKm: haversineKm(body.user_lat as number, body.user_lng as number, c.lat, c.lng),
            };
          })
          .filter((x): x is { doc: (typeof kbDocs)[number]; distanceKm: number } => x !== null)
          .sort((a, b) => a.distanceKm - b.distanceKm);

        if (withDistance.length > 0) {
          nearbyShopNames = withDistance.slice(0, 5).map((x) => stripAdminPrefix(x.doc.title));
          const nearestUrls = new Set(withDistance.map((x) => x.doc.url));
          kbDocs = [
            ...withDistance.map((x) => x.doc),
            ...kbDocs.filter((d) => !nearestUrls.has(d.url)),
          ];
        }
      }
    }
  }

  // 街の声: 噂ネタ(自動収集で客向けにポジティブだけ蒸留したもの/運営の手入力)をAIに渡し、
  // 提案の中で「こんな情報もあるんだよ」と直接織り込ませる。ネタのある店を先頭に寄せる。
  if (isMachiNoKoe && whisperByUrl.size > 0) {
    const withNeta = kbDocs
      .filter((doc) => whisperByUrl.has(doc.url))
      .map((doc) => ({
        ...doc,
        content: `${doc.content}\n★街の噂ネタ(ネット上の声・真偽不明): ${whisperByUrl.get(doc.url)!.text}`,
      }));
    kbDocs = [...withNeta, ...kbDocs.filter((doc) => !whisperByUrl.has(doc.url))];
  }

  // 画面で選択中のキーワード/ジャンルタグ。AIの判断に任せると取りこぼすため、条件に合う店舗をコード側で
  // 判定して先頭に並べ、「★」の印を付けて渡す(キーワードは店名・URL以外の店舗情報全体への部分一致、
  // ジャンルタグは「ジャンル: ○○」欄の一致。両方選択時は両方に合致した店舗を優先)。
  const selectedKeyword = sanitizeTag(body.selected_keyword, 30);
  const selectedGenres = (Array.isArray(body.selected_genres) ? body.selected_genres : [])
    .map((g) => sanitizeTag(g, 30))
    .filter(Boolean)
    .slice(0, 8);
  const selectedParts: string[] = [];
  if (selectedKeyword) selectedParts.push(`検索キーワード「${selectedKeyword}」`);
  if (selectedGenres.length > 0) selectedParts.push(`ジャンルタグ「${selectedGenres.join("」「")}」`);
  let selectedMatchCount = 0;
  if (selectedParts.length > 0) {
    const kw = selectedKeyword.toLowerCase();
    const matches = (doc: { title: string; content: string }) => {
      const text = `${doc.title}\n${doc.content}`;
      const kwOk = !kw || text.toLowerCase().includes(kw);
      const genreOk =
        selectedGenres.length === 0 || selectedGenres.some((g) => doc.content.includes(`ジャンル: ${g}`));
      return kwOk && genreOk;
    };
    const matched = kbDocs.filter(matches).map((d) => ({ ...d, content: `★画面で選択中の条件に合致\n${d.content}` }));
    selectedMatchCount = matched.length;
    const matchedUrls = new Set(matched.map((d) => d.url));
    kbDocs = [...matched, ...kbDocs.filter((d) => !matchedUrls.has(d.url))];
  }

  // 街の声: 相手が働き先を探していそうなら、調査ログ(体入・求人サイト等から集めた生データ)から
  // 働く側の条件(時給・体入・送り等)の行を拾って「★求人の噂」として渡し、その店を先頭に寄せる。
  // 今の発言に加え、直前のユーザー発言(2〜3件)も見る(「六本木だと?」のような続きの質問に対応)。
  let jobIntent = false;
  if (isMachiNoKoe) {
    jobIntent = JOB_INTENT_RE.test(message);
    if (!jobIntent) {
      const { data: recentUserMsgs } = await supabase
        .from("messages")
        .select("content")
        .eq("conversation_id", conversation.id)
        .eq("role", "user")
        .order("created_at", { ascending: false })
        .limit(4);
      jobIntent = (recentUserMsgs ?? []).some((m) => JOB_INTENT_RE.test(String(m.content ?? "")));
    }
  }
  if (jobIntent) {
    const logTable = isLocapassNetworkDomain ? "locapass_shop_street_investigations" : "shop_street_investigations";
    const ids = [...new Set(kbDocs.map((d) => shopIdByUrl.get(d.url)).filter((v): v is string => Boolean(v)))];
    const jobByShopId = new Map<string, string[]>();
    if (ids.length > 0) {
      const { data: logs, error: logsError } = await supabasePublic
        .from(logTable)
        .select("shop_id, raw_text, created_at")
        .in("shop_id", ids)
        .order("created_at", { ascending: false })
        .limit(600);
      if (logsError) console.error("street investigations lookup failed", logsError);
      for (const log of logs ?? []) {
        const shopId = log.shop_id as string;
        if (jobByShopId.has(shopId)) continue; // 店舗ごとに最新の調査だけ使う
        const lines = extractJobLines(String(log.raw_text ?? ""));
        if (lines.length > 0) jobByShopId.set(shopId, lines);
      }
    }
    const withJob = kbDocs
      .filter((doc) => jobByShopId.has(shopIdByUrl.get(doc.url) ?? ""))
      .map((doc) => ({
        ...doc,
        content: `${doc.content}\n★求人の噂(求人・体入サイト等のネット情報・真偽不明・古い可能性あり): ${jobByShopId
          .get(shopIdByUrl.get(doc.url)!)!
          .join(" / ")}`,
      }));
    const withJobUrls = new Set(withJob.map((d) => d.url));
    kbDocs = [...withJob, ...kbDocs.filter((d) => !withJobUrls.has(d.url))];
  }

  let orderedHistory: { role: string; content: string }[] = [];
  // ログイン中の顧客は、同じサイトでの過去の会話もまたいで履歴を渡す(Training Farmの本人特定機能)。
  // ただし「街の声」は今の会話だけを覚える(↻で新しい会話にしたら前の話を引きずらない)。
  // また、通常のコンシェルジュの履歴には街の声の会話(session_id が machi_ で始まる)を混ぜない。
  if (conversation.customer_id && !isMachiNoKoe) {
    const { data: pastConversations } = await supabase
      .from("conversations")
      .select("id")
      .eq("site_id", site.id)
      .eq("customer_id", conversation.customer_id)
      .not("session_id", "like", "machi_%");
    const conversationIds = (pastConversations ?? []).map((c) => c.id);
    if (conversationIds.length > 0) {
      const { data: history } = await supabase
        .from("messages")
        .select("role, content")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: false })
        .limit(MAX_HISTORY_MESSAGES);
      orderedHistory = (history ?? []).slice().reverse();
    }
  } else {
    const { data: history } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(MAX_HISTORY_MESSAGES);
    orderedHistory = (history ?? []).slice().reverse();
  }

  // 店舗数が多いサイトは、質問に関係する店だけに絞ってAIに渡す(検索用データが無い・失敗したときは絞らず従来どおり)。
  // ここまでの並べ替えで先頭に寄せた「★」付きの店は、必ず残す。
  const protectedIdx = kbDocs.findIndex((d) => !d.content.includes("★"));
  const narrowed = await narrowKbDocs({
    db: supabase,
    kbDocs,
    protectedCount: protectedIdx === -1 ? kbDocs.length : protectedIdx,
    message,
    // orderedHistory には今回の質問も入っているので、直前までのユーザー発言はそれを除いた新しい順。
    recentUserTexts: orderedHistory.filter((m) => m.role === "user").map((m) => m.content).reverse().slice(1),
    recentAiTexts: orderedHistory.filter((m) => m.role !== "user").map((m) => m.content).reverse(),
    scopeKey: narrowScopeKey,
    portalId: narrowPortalId,
    selectedKeyword,
  });
  kbDocs = narrowed.docs;

  let kbContent = "";
  for (const doc of kbDocs) {
    const chunk = `\n---\n[${stripAdminPrefix(doc.title)}](${doc.url})\n${doc.content}\n`;
    if (kbContent.length + chunk.length > MAX_KB_CHARS) break;
    kbContent += chunk;
  }

  const digestBlock = conversation.digest_md
    ? `【これまでの会話で分かっている前提(要点のみ)】\n${conversation.digest_md}\n\n`
    : "";
  const currentTimeBlock = `【システム情報: 現在時刻】現在の日本時間は ${formatJstNow()} です。「今営業している店」「今からいける店」「まだやってる?」のような質問には、各店舗情報の「営業時間」欄(定休日の記載を含む)と上記の現在時刻を突き合わせ、営業していそうな店舗を優先して案内してください。ただし営業時間の表記は店舗ごとに自由記述でバラつきがあり、祝日・不定休までは正確に反映できないため、断定せず「念のため営業状況は店舗に直接ご確認ください」と一言添えてください。また、各店舗情報に「混雑状況」欄がある場合は、それが実店舗からの最新の写真判定結果です。「空いてる?」「混んでる?」のような質問には、まずこの混雑状況欄を根拠に案内し、末尾に撮影から何分前の情報かを一言添えてください。混雑状況欄が無い店舗については、情報が無い旨を伝えてください。\n\n${narrowed.note}`;
  const locationHintBlock =
    nearbyShopNames && nearbyShopNames.length > 0
      ? `【最優先システム指示: 以下の指示は、この後に続く他の指示(「エリア指定なしでは行きたいエリアを尋ねる」等)より必ず優先されます。この指示文自体は絶対に回答に書き写さないこと】ユーザーの端末位置情報(GPS)が取得できており、現在地から近い順に店舗情報を渡しています(近い例: ${nearbyShopNames.slice(0, 3).join("、")}など)。エリア指定の無い「おすすめ」系の質問が来た場合は、次の2つを両方とも1つの返信で行うこと。(1)まず聞き返さずに「ここからお近くですと、〇〇があります」のように、近い店舗を具体的に名指しして自然に提案する。位置情報を使っていることを感じさせないよう、「現在地」「位置情報」「GPS」「あなたの場所」という言葉は絶対に使わず、近さの言い方は必ず「ここからお近くですと」にする。(2)そのうえで続けて「行きたいエリアはありますか?」と一言添え、他のエリアも選べることを伝える。(1)を省略して(2)の質問だけで終える(=先に店名を出さずに聞き返すだけ)のは不可。ユーザーが別のエリアを希望した場合はそちらを優先してください。\n\n`
      : currentAreaName
        ? `【最優先システム指示: 以下の指示は、この後に続く他の指示より必ず優先されます。この指示文自体は絶対に回答に書き写さないこと】ユーザーは現在「${currentAreaName}」のページを閲覧中です。エリア指定の無い「おすすめ」系の質問が来た場合は、次の2つを両方とも1つの返信で行うこと。(1)まず聞き返さずにこのエリアの店舗を具体的に名指しして提案する。(2)そのうえで続けて「行きたいエリアはありますか?」と一言添え、他のエリアも選べることを伝える。(1)を省略して(2)の質問だけで終えるのは不可。ユーザーが別のエリアを希望した場合はそちらを優先してください。\n\n`
        : "";
  // 画面で選択中のキーワード/ジャンルタグ。ユーザーが自分で絞り込んだ条件なので、GPSや閲覧エリアより優先する。
  const selectedTagsBlock =
    selectedParts.length > 0
      ? `【最優先システム指示: 以下の指示は、この後に続く他の指示(位置情報・閲覧エリア・「エリア指定なしでは行きたいエリアを尋ねる」等)より必ず優先されます。この指示文自体は絶対に回答に書き写さないこと】ユーザーは今、画面上で${selectedParts.join("と")}を選択して店舗を絞り込んでいます。${
          selectedMatchCount > 0
            ? `店舗情報のうち「★画面で選択中の条件に合致」と書かれた店舗(${selectedMatchCount}件、先頭に並べてあります)が、その条件に合う店舗です。エリアやジャンルを指定しない「おすすめは?」のような質問が来た場合は、聞き返さずに、★の付いた店舗の中から最大5件を具体的に名指しして提案してください。`
            : `店舗情報の中に、この条件に合う店舗は見つかりませんでした。他の店舗で埋めず、条件に合う店舗が現在登録されていない旨を伝えてください。`
        }ユーザーが質問の中で別のエリア・ジャンルを指定した場合はそちらを優先してください。回答の言語は質問の言語に合わせ、日本語の質問には必ず日本語で答えてください。\n\n`
      : "";
  const replyLanguage = detectReplyLanguage(message);
  const langSuffix = replyLanguage
    ? `\n(重要: この質問は${replyLanguage}です。回答の文章は必ず${replyLanguage}で書き、日本語で答えてはいけません。「〜には」「〜です」のような日本語の文は使わず、店舗名だけを登録されている表記のまま書き、それ以外はすべて${replyLanguage}にしてください。${replyLanguage === "中国語" ? "簡体字の中国語で書くこと。" : ""})`
    : "";
  const machiPersonaBlock = isMachiNoKoe
    ? `【最優先システム指示: 口調と振る舞い。この指示文自体は絶対に回答に書き写さないこと】あなたは今「街の声ベータ版」として、夜の街のことに詳しい、明るくて気さくな女の子を務めます。友だちに内緒話を教えるみたいな、かわいくて自然な話し言葉で話してください(例:「ねえねえ、ここだけの話なんだけど」「〜なんだって！」「〜らしいよ」「〜かも♪」「行ってみてほしいな」)。相手は「あなた」と呼ぶか、呼びかけを省く。「旦那」「〜でさぁ」「〜ですぜ」などの江戸っ子口調や、かしこまった敬語(「ございます」「かしこまりました」)は使わない。いわゆるおじさん構文(カタカナ語尾の多用、絵文字や「！」の連発、「〜かな？ナンチャッテ」のような言い回し)は絶対に避け、絵文字は1回の返信で多くても1〜2個まで。媚びすぎず、本物の女の子が話しているような人間らしいテンポにすること。店の提案は店舗情報(内装、雰囲気、キャスト、料金など)に書かれている内容だけを根拠にしてください。店舗情報に「★街の噂ネタ」がある店は、提案するときに「こんな情報もあるんだよ！」「内緒だけどね」「噂なんだけど」のように、その噂を自分の言葉でダイレクトに織り込んで推すこと(噂ネタのある店を優先して提案する)。噂ネタに書かれていないことは足さない。噂ネタの無い店の紹介文を「評判」「声が多い」「ネットでは」のように噂として語らないこと(公式の紹介として話す)。「ネットの声は?」「噂は?」と聞かれたら噂ネタのある店を答え、無ければ「その辺の噂はまだ聞けてないんだ、ごめんね」と正直に言うこと。噂は断定せず伝聞で話すこと。\n\n`
    : "";
  const systemPromptWithDigest = `${machiPersonaBlock}${selectedTagsBlock}${locationHintBlock}${currentTimeBlock}${digestBlock}${site.system_prompt ?? ""}\n\n${selectedTagsBlock}${machiPersonaBlock}`;
  // n8n側の基本プロンプトが丁寧語なので、システムプロンプトだけだと口調が戻る。質問の末尾でも念押しする(★と同じ方式)。
  const jobSuffix = jobIntent
    ? `\n(補足: 相手は働き先を探しているみたい。お客さん目線ではなく働く子の目線で、店舗情報の「★求人の噂」がある店を優先して2〜3店すすめること。時給・体入・送り・バックなどは「ネットだとこう書かれてるよ」という噂として伝え、断定しない。最後に必ず「条件は変わってるかもだから、応募する前にお店に直接確認してね」と一言添えること。★求人の噂に無い条件は作らない。「★求人の噂」「★街の噂ネタ」という目印の名前は返事に書かない。相手が18歳未満・高校生だと分かったら、お店は紹介せず、18歳になってからねと優しく伝えること)`
    : "";
  const machiSuffix = isMachiNoKoe
    ? `\n(口調の指定: 上の指示どおり、夜の街に詳しい明るい女の子として、かわいく自然な話し言葉(「ねえねえ」「〜なんだって！」「〜らしいよ」)で答えること。「旦那」や江戸っ子口調、丁寧語・敬語、おじさん構文は使わない。絵文字は多くても1〜2個。日本語で答えるときは「rumour」「rumor」「exciting」のような英単語を混ぜず、「噂だと」「ワクワク」のように日本語で言うこと(店名はそのまま)。店舗情報に「★街の噂ネタ」がある店を推すときは「こんな情報もあるんだよ！」とその噂をダイレクトに織り込むこと。「ございます」「かしこまりました」「〜でしょうか」などの丁寧語・敬語は使わない。近いお店を言うときは「ここからお近くだと」のようにさりげなく言い、「現在地」「位置情報」という言葉は使わない。相手は遊びに行くお客さんなので、お客さん目線の魅力(雰囲気・お酒や料理・イベント・話題・賑わい)で推すこと。採用・求人・働きやすさ・キャストの育成の話は、相手が自分から働き先を聞いたときだけにする。店は2〜3店に絞り、一言ずつ推しポイントを添えて、返事全体は200文字くらいまでの短さにすること。長い前置きやまとめは要らない)`
    : "";

  const webhookUrl = Deno.env.get("WP_INQUIRY_N8N_WEBHOOK_URL") ??
    "https://n8n.id4s.com/webhook/wp-inquiry-chat";

  let n8nResult: { reply?: string; escalate?: boolean };
  try {
    const n8nResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        site_domain: site.domain,
        bot_name: site.bot_name,
        system_prompt: systemPromptWithDigest,
        escalation_hint: site.escalation_hint,
        kb_content: kbContent,
        history: orderedHistory,
        question:
          (selectedParts.length > 0
            ? selectedMatchCount > 0
              ? `${message}\n(補足: ユーザーは画面上で${selectedParts.join("と")}を選択中です。エリア・ジャンルを聞き返さず、店舗情報で「★画面で選択中の条件に合致」と書かれた店舗の中から具体的に名指しして答えてください)`
              : `${message}\n(補足: ユーザーは画面上で${selectedParts.join("と")}を選択中ですが、該当する店舗は登録されていません。その旨を伝えてください)`
            : message) + machiSuffix + jobSuffix + langSuffix,
        customer_name: customerName,
      }),
    });
    if (!n8nResponse.ok) {
      throw new Error(`n8n responded ${n8nResponse.status}`);
    }
    n8nResult = await n8nResponse.json();
  } catch (err) {
    console.error("n8n call failed", err);
    return json({
      reply: "只今混み合っております。少し時間をおいて再度お試しください。",
      escalated: false,
    });
  }

  let reply = n8nResult.reply ?? "申し訳ございません、もう一度お試しください。";
  for (const doc of kbDocs) {
    const bare = stripAdminPrefix(doc.title);
    if (bare && doc.title !== bare && reply.includes(doc.title)) {
      reply = reply.split(doc.title).join(bare);
    }
  }
  const escalate = Boolean(n8nResult.escalate);

  // チャット欄は装飾なしの文字表示なので、Markdownの太字(**)・行頭の箇条書き記号(* / -)・`コード`記号は全モードで外す。
  reply = reply
    .replace(/\*\*(.+?)\*\*/gu, "$1")
    .replace(/^[ \t]*[*-][ \t]+/gmu, "・")
    .replace(/`([^`\n]+)`/gu, "$1")
    // 位置情報を探られていると感じさせないよう、「現在地から近い…」の言い回しを「ここからお近くですと」に揃える。
    .replace(/(?:お客様の|あなたの)?現在地(?:から|の)?(?:近く|近い|最寄り)(?:の)?(?:店舗|お店|店)?(?:ですと|だと|では|でしたら|なら)?[、,]?/gu, "ここからお近くですと、")
    .replace(/現在地周辺(?:ですと|だと|では|でしたら|なら)?[、,]?/gu, "ここからお近くですと、")
    .replace(/ここからお近くですと、(?:ですと|だと)?[、,]?/gu, "ここからお近くですと、")
    // 名前が分からないときにAIが書く仮の呼びかけ(「〇〇様、」「○○さん」等)を消す。
    .replace(/[〇○◯]{1,4}\s*(?:様|さん|さま)[、,。！!]?\s*/gu, "");

  // 街の声では噂ネタのある店を店舗情報の先頭に並べるため、AIが店舗情報の見出し形式
  // ([店名](URL))を真似て本文にURLを書き出すことがある。リンクは下のボタンで出すので本文からは消す。
  if (isMachiNoKoe) {
    reply = reply
      .replace(/\[\{?([^\[\]{}]+?)\}?\]\(https?:\/\/[^)\s]+\)/gu, "$1")
      .replace(/\s*\(https?:\/\/[^)\s]+\)/gu, "")
      .replace(/https?:\/\/\S+/gu, "")
      // チャット欄は装飾なしの文字表示なので、Markdownの太字・箇条書き記号も外す。
      .replace(/\*\*(.+?)\*\*/gu, "$1")
      .replace(/^[ \t]*[*-][ \t]+/gmu, "・")
      // 店舗情報に付けた内部の目印(★街の噂ネタ / ★求人の噂)を本文に書き写したら消す。
      .replace(/[「『]?★(?:街の噂ネタ|求人の噂)[」』]?(?:では|で|に|の)?/gu, "")
      .replace(/★/gu, "");
  }

  const mentionedLinks: { title: string; url: string }[] = [];
  const seenDocUrls = new Set<string>();
  const bracketMatches = [...reply.matchAll(/\[\[([^\[\]]+)\]\]/gu)].map((m) => m[1].trim());
  for (const marked of bracketMatches) {
    const doc = kbDocs.find((d) => stripAdminPrefix(d.title) === marked || d.title === marked);
    if (doc && !seenDocUrls.has(doc.url)) {
      mentionedLinks.push({ title: stripAdminPrefix(doc.title), url: doc.url });
      seenDocUrls.add(doc.url);
    }
    if (mentionedLinks.length >= 5) break;
  }
  reply = reply.replace(/\[\[([^\[\]]+)\]\]/gu, "$1");

  if (mentionedLinks.length < 5) {
    for (const doc of kbDocs) {
      if (seenDocUrls.has(doc.url)) continue;
      const coreName = coreNameFromTitle(doc.title);
      if (coreName.length >= 2 && reply.includes(coreName)) {
        mentionedLinks.push({ title: stripAdminPrefix(doc.title), url: doc.url });
        seenDocUrls.add(doc.url);
      }
      if (mentionedLinks.length >= 5) break;
    }
  }

  // 街の声で提案した店は「見られた店」なので、噂ネタが古ければ各サイトのAPIで裏更新してもらう
  // (Stale-While-Revalidate。3日ルール・1日上限・同時実行の防止はAPI側で判定する)。応答は待たせない。
  if (isMachiNoKoe) {
    const base = isLocapassNetworkDomain ? "https://locapass.net" : "https://luxela.jp";
    const ids = [...new Set(mentionedLinks.map((link) => shopIdByUrl.get(link.url)).filter((v): v is string => Boolean(v)))];
    if (ids.length > 0) {
      const pings = Promise.allSettled(
        ids.map((shopId) => fetch(`${base}/api/shops/${shopId}/sync-whisper`, { method: "POST" })),
      );
      (globalThis as any).EdgeRuntime?.waitUntil?.(pings);
    }
  }

  // 噂ネタのある店を回答で提案したら、画面に「※ネットの噂レベルです」の注記を出す。
  const usedWhisperShops = isMachiNoKoe
    ? mentionedLinks.filter((link) => whisperByUrl.has(link.url)).map((link) => link.title)
    : [];

  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    role: "ai",
    // タレコミ文は保存しない(履歴としてAIに戻すと、AIが噂を言い換えて語り出すため)。
    content: reply,
  });

  if (escalate) {
    await supabase
      .from("conversations")
      .update({ status: "escalated", updated_at: new Date().toISOString() })
      .eq("id", conversation.id);
  } else {
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversation.id);
  }

  if (!escalate && newTurnCount % DIGEST_EVERY_N_TURNS === 0) {
    const bgTask = summarizeDigest(supabase, conversation.id, conversation.digest_md);
    (globalThis as any).EdgeRuntime?.waitUntil?.(bgTask);
  }

  return json({
    reply,
    escalated: escalate,
    links: mentionedLinks,
    ...(isMachiNoKoe ? { whisper_shops: usedWhisperShops } : {}),
  });
});
