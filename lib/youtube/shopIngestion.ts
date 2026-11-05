import { createEmbedPostForShop } from "@/lib/embed-post/createEmbedPost";
import { createAdminClient } from "@/lib/supabase/admin";
import { geocodeAddress, normalizeAddress } from "@/lib/map/addressGeocode";
import { LOCAPASS_CATEGORIES } from "@/lib/shop/locapassCategories";
import { previewShopImport } from "@/lib/shop/importFromWebsite";

export type YoutubeCandidate = {
  youtubeId: string;
  title: string;
  description: string;
  channelTitle: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
  embeddable: boolean;
  sourceQuery: string;
};

type YoutubeSearchResponse = {
  items?: { id?: { videoId?: string } }[];
};

type YoutubeVideoResponse = {
  items?: {
    id: string;
    snippet?: { title?: string; description?: string; channelTitle?: string; publishedAt?: string };
    contentDetails?: { duration?: string };
    status?: { embeddable?: boolean };
  }[];
};

type IngestionRow = {
  id: string;
  portal_id: number;
  youtube_id: string;
  video_url: string;
  title: string;
  description: string | null;
  candidate_name: string | null;
  candidate_address: string | null;
  official_url: string | null;
  official_url_verified: boolean;
  match_status: string;
  matched_shop_id: string | null;
  reel_id: string | null;
};

const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";

function apiKey() {
  const key = process.env.YOUTUBE_DATA_API_KEY ?? process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_DATA_API_KEY または YOUTUBE_API_KEY が未設定です");
  return key;
}

function parseDuration(value?: string): number | null {
  if (!value) return null;
  const m = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

function cleanText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

/** 店名・住所の後ろに続く「営業時間」「最寄り駅」などの付帯情報。ここで切る。 */
const FIELD_STOP = /\s*(?:📍|🏠|🗼|🚃|🚞|🚶|🚉|🕐|🕰|⏰|📞|☎|💰|📅|🔹|◆|【|#|＃|-—|—|━|⁡|・?住所|・?営業時間|・?定休日|・?周辺駅|・?アクセス|・?最寄り?駅|・?電話|・?予算|・?支払い|\s[^\s]{0,10}駅(?:から|より)?\s*徒歩).*/;
/** 都道府県から始まる住所表記。「住所:」のラベルが無い説明欄(📍 東京都…)も拾う。 */
const PREFECTURE_ADDRESS = /(?:〒\s*\d{3}-?\d{4}\s*)?((?:東京都|北海道|(?:京都|大阪)府|[^\s\d、。・：:]{2,3}県)[^\s#＃、。]{3,60}(?:\s+[^\s#＃📍🏠🚃🚶🚉⏰📞☎]{1,40}){0,2})/;

function trimField(value: string | undefined, max: number) {
  if (!value) return null;
  const cut = cleanText(value).replace(/^[」』”】\s]+/, "").replace(/^[「『“｢]/, "").replace(FIELD_STOP, "").replace(/[」』”｣】]$/, "").replace(/[」』”｣]\s*$/, "").trim();
  return cut.slice(0, max) || null;
}

/**
 * 動画のタイトルと説明欄から、店名・住所の候補を拾う。
 * 「店名：」「📍店名」「【店名】」のラベル付き表記と、ラベル無しの「📍 東京都…」形式の住所に対応する。
 * 複数店舗を紹介する動画(①②…や「〇選」)は店舗を特定できないので住所を返さない。
 */
export function extractShopHint(title: string, description: string): { name: string | null; address: string | null } {
  const source = `${title}\n${description}`;
  // 番地まである住所が2件以上ある(=複数店舗の紹介)か、「〇選」「TOP3」「①②」形式なら1店舗に絞れない。
  const addressCount = new Set(normalizeAddress(source).match(/(?:東京都|北海道|大阪府|京都府|[^\s\d、。・：:]{2,3}県)[^\s\d#、。]{2,20}\d/g) ?? []).size;
  const multiShop = addressCount > 1 || /[①②③]|\d\s*選|TOP\s*\d/i.test(source);
  const name = source.match(/(?:店名|店舗名)\s*】?\s*[：:]?\s*[「『“｢]?([^\n\r#]{2,80})/i)?.[1];
  const labeled = source.match(/(?:住所|所在地)\s*】?\s*(?:[：:]|📍)?\s*([^\n\r#]{8,140})/i)?.[1];
  const loose = labeled ? undefined : source.match(PREFECTURE_ADDRESS)?.[1];
  const rawAddress = trimField(labeled ?? loose, 300);
  const address = rawAddress ? normalizeAddress(rawAddress.replace(/^[^\p{L}\p{N}〒]+/u, "").replace(/^〒\s*\d{3}-?\d{4}\s*/, "")) || null : null;
  return {
    name: trimField(name, 120),
    address: multiShop ? null : address && /\d/.test(address) ? address : null,
  };
}

async function youtubeJson<T>(path: string, params: Record<string, string>) {
  const url = new URL(`${YOUTUBE_API}/${path}`);
  url.searchParams.set("key", apiKey());
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`YouTube API ${response.status}: ${(await response.text()).slice(0, 240)}`);
  return response.json() as Promise<T>;
}

/** 検索と動画詳細を分離し、候補の長さ・埋め込み可否で絞る。 */
export async function collectYoutubeCandidates(query: string, maxResults = 50, publishedAfter?: string): Promise<YoutubeCandidate[]> {
  const search = await youtubeJson<YoutubeSearchResponse>("search", {
    part: "id",
    q: query,
    type: "video",
    regionCode: "JP",
    relevanceLanguage: "ja",
    maxResults: String(Math.min(Math.max(maxResults, 1), 50)),
    order: "date",
    videoEmbeddable: "true",
    ...(publishedAfter ? { publishedAfter } : {}),
  });
  const ids = [...new Set((search.items ?? []).map((item) => item.id?.videoId).filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return [];
  const details = await youtubeJson<YoutubeVideoResponse>("videos", {
    part: "snippet,contentDetails,status",
    id: ids.join(","),
    maxResults: String(ids.length),
  });
  return (details.items ?? [])
    .map((video) => ({
      youtubeId: video.id,
      title: cleanText(video.snippet?.title ?? ""),
      description: cleanText(video.snippet?.description ?? ""),
      channelTitle: video.snippet?.channelTitle ? cleanText(video.snippet.channelTitle) : null,
      publishedAt: video.snippet?.publishedAt ?? null,
      durationSeconds: parseDuration(video.contentDetails?.duration),
      embeddable: video.status?.embeddable === true,
      sourceQuery: query,
    }))
    .filter((video) => video.title && video.embeddable && video.durationSeconds !== null && video.durationSeconds <= 180);
}

const TOKYO_BEAUTY_QUERIES = [
  "東京 美容室",
  "東京 ヘアサロン",
  "東京 ネイルサロン",
  "東京 エステ",
  "東京 アイラッシュ",
  "東京 バーバー",
  "東京 ヘッドスパ",
  "東京 メンズ美容",
] as const;

/** 東京のビューティー系を新着順で収集し、Health & Beautyポータルへストックする。 */
export async function collectTokyoBeautyStock(options?: {
  portalId?: number;
  perQuery?: number;
  publishedAfter?: string;
}) {
  const portalId = options?.portalId ?? 408;
  const perQuery = Math.min(Math.max(options?.perQuery ?? 10, 1), 25);
  const publishedAfter = options?.publishedAfter ?? new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
  let fetched = 0;
  let saved = 0;
  let matched = 0;
  for (const query of TOKYO_BEAUTY_QUERIES) {
    const candidates = await collectYoutubeCandidates(query, perQuery, publishedAfter);
    fetched += candidates.length;
    saved += await saveYoutubeCandidates(portalId, candidates);
    matched += await autoMatchYoutubeCandidates(portalId, candidates.slice(0, 5));
  }
  return { portalId, queries: TOKYO_BEAUTY_QUERIES.length, fetched, saved, matched, publishedAfter };
}

/** 管理画面から同一動画を何度集めても候補を増やさない。 */
export async function saveYoutubeCandidates(portalId: number, candidates: YoutubeCandidate[]) {
  const admin = createAdminClient();
  const rows = candidates.map((video) => {
    const hint = extractShopHint(video.title, video.description);
    return {
      portal_id: portalId,
      youtube_id: video.youtubeId,
      video_url: `https://www.youtube.com/shorts/${video.youtubeId}`,
      title: video.title,
      description: video.description || null,
      channel_title: video.channelTitle,
      published_at: video.publishedAt,
      duration_seconds: video.durationSeconds,
      embeddable: video.embeddable,
      source_query: video.sourceQuery,
      candidate_name: hint.name,
      candidate_address: hint.address,
    };
  });
  if (rows.length === 0) return 0;
  const { error } = await (admin as any).from("locapass_youtube_ingestions").upsert(rows, { onConflict: "portal_id,youtube_id", ignoreDuplicates: true });
  if (error) throw new Error(`候補の保存に失敗しました: ${error.message}`);
  return rows.length;
}

/** 店名・住所が説明文から明確に取れ、既存店が一意に一致する候補だけを自動紐づけする。 */
export async function autoMatchYoutubeCandidates(portalId: number, candidates: YoutubeCandidate[], userId?: string) {
  const admin = createAdminClient();
  let matched = 0;
  for (const video of candidates) {
    const hint = extractShopHint(video.title, video.description);
    if (!hint.name) continue;
    const shops = await findExistingShop(portalId, hint.name, hint.address);
    if (shops.length !== 1) continue;
    const shop = shops[0];
    const { data: ingestion } = await (admin as any).from("locapass_youtube_ingestions").select("id").eq("portal_id", portalId).eq("youtube_id", video.youtubeId).maybeSingle();
    const { error } = await (admin as any).from("locapass_youtube_ingestions").update({
      candidate_name: hint.name,
      candidate_address: hint.address,
      matched_shop_id: shop.id,
      official_url: shop.url,
      official_url_verified: Boolean(shop.url),
      match_status: "matched_existing",
      match_reason: "説明文の店名・住所と既存店舗が一意に一致したため自動紐づけ",
      error_message: null,
    }).eq("portal_id", portalId).eq("youtube_id", video.youtubeId);
    if (!error) {
      matched += 1;
      if (userId && ingestion?.id) {
        try {
          await publishYoutubeIngestion(ingestion.id, userId);
        } catch (publishError) {
          await (admin as any).from("locapass_youtube_ingestions").update({
            error_message: publishError instanceof Error ? publishError.message.slice(0, 500) : "自動リール投稿に失敗しました",
          }).eq("id", ingestion.id);
        }
      }
    }
  }
  return matched;
}

/** 既存の保留候補を少量ずつ再処理する。タイムアウトと誤判定を避けるため上限は5件。 */
export async function autoProcessPendingYoutubeIngestions(portalId: number | null, limit: number, userId: string) {
  const admin = createAdminClient();
  let query = (admin as any).from("locapass_youtube_ingestions")
    .select("id, portal_id, youtube_id, title, description")
    .eq("source_provider", "youtube")
    .eq("match_status", "pending")
    .order("created_at", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 5));
  if (portalId) query = query.eq("portal_id", portalId);
  const { data: rows, error } = await query;
  if (error) throw new Error(`保留候補の取得に失敗しました: ${error.message}`);
  let matched = 0;
  let published = 0;
  for (const row of (rows ?? []) as { id: string; portal_id: number; youtube_id: string; title: string; description: string | null }[]) {
    const hint = extractShopHint(row.title, row.description ?? "");
    if (!hint.name) continue;
    const shops = await findExistingShop(row.portal_id, hint.name, hint.address);
    if (shops.length !== 1) continue;
    const shop = shops[0];
    const { error: updateError } = await (admin as any).from("locapass_youtube_ingestions").update({
      candidate_name: hint.name,
      candidate_address: hint.address,
      matched_shop_id: shop.id,
      official_url: shop.url,
      official_url_verified: Boolean(shop.url),
      match_status: "matched_existing",
      match_reason: "保留候補の再処理で説明文と既存店舗が一意に一致",
      reviewed_at: new Date().toISOString(),
      reviewed_by: userId,
      error_message: null,
    }).eq("id", row.id);
    if (updateError) continue;
    matched += 1;
    try {
      await publishYoutubeIngestion(row.id, userId);
      published += 1;
    } catch (publishError) {
      await (admin as any).from("locapass_youtube_ingestions").update({ error_message: publishError instanceof Error ? publishError.message.slice(0, 500) : "自動リール投稿に失敗しました" }).eq("id", row.id);
    }
  }
  return { scanned: (rows ?? []).length, matched, published };
}

/** 店名・住所・公式URLに基づく既存店舗の候補。完全一致以外は確認画面で承認する。 */
export async function findExistingShop(portalId: number, name: string, address?: string | null) {
  const admin = createAdminClient();
  const term = name.replace(/[%_,()\\]/g, " ").trim();
  if (!term) return [] as { id: string; name: string; address: string | null; url: string | null; status: string }[];
  let query = admin.from("locapass_shops").select("id, name, address, url, status").eq("portal_id", portalId).ilike("name", `%${term}%`).limit(10);
  if (address?.trim()) query = query.ilike("address", `%${address.trim().slice(0, 20)}%`);
  const { data, error } = await query;
  if (error) throw new Error(`既存店舗の検索に失敗しました: ${error.message}`);
  return data ?? [];
}

export type ShopIdentification = {
  name: string | null;
  address: string | null;
  officialUrl: string | null;
  category: string;
  reason: string;
};

/** Geminiの応答テキストから最初のJSONオブジェクトを取り出す(検索ツール併用時はJSONモードが使えないため)。 */
function parseJsonObject(raw: string) {
  const text = raw.replace(/```json\s*|```/g, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("店舗特定の結果を読み取れませんでした");
  return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
}

/**
 * 動画のタイトル・説明欄(+Google検索)から、紹介された1店舗の店名と住所を特定する。
 * 掲載基準は「店名と住所(番地まで)が分かること」。公式サイトは見つかれば添えるだけで、無くても通す。
 * 複数店舗の紹介動画・店舗ではない動画・住所が特定できない動画は name/address を null で返す。
 */
export async function identifyShopFromVideo(input: { title: string; description?: string | null; name?: string | null; address?: string | null }): Promise<ShopIdentification> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY が未設定です");
  const prompt = [
    "YouTubeの紹介動画で取り上げられた、日本国内の店舗(飲食店・カフェ・スイーツ店・体験施設など)を1店舗特定してください。",
    "説明欄に店名・住所が書いてあればそれを最優先で使い、足りない部分だけGoogle検索で補ってください。",
    "",
    `動画タイトル: ${input.title}`,
    `説明欄: ${(input.description ?? "").slice(0, 2500) || "なし"}`,
    `店名候補: ${input.name ?? "不明"}`,
    `住所候補: ${input.address ?? "不明"}`,
    "",
    "判定ルール:",
    "- 店名と住所(都道府県から番地まで)が分かれば十分です。公式サイトや支店の確認が取れなくても構いません。",
    "- 住所は営業時間・最寄り駅・電話番号などを含めず、建物名と階数までにしてください。",
    "- チェーン店は動画に出てくる支店名と、その支店の住所にしてください。支店が絞り込めない場合だけ null にしてください。",
    "- 複数の店舗を紹介する動画(〇選・TOP3・はしご等)や、店舗の紹介ではない動画は name と address を null にしてください。",
    "- officialUrl は店舗または運営会社の公式サイトが見つかった場合のみ。無ければ null(グルメサイト・SNS・地図は不可)。",
    `- category は次のどれか1つ: ${LOCAPASS_CATEGORIES.join(" / ")}`,
    "",
    "出力は次のJSONだけにしてください(前後に文章を付けない)。",
    '{"name":string|null,"address":string|null,"officialUrl":string|null,"category":string,"reason":string}',
  ].join("\n");
  // google_search ツールと responseMimeType(JSONモード)は同時指定すると 400 になるため、JSONはテキストから取り出す。
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`店舗の特定に失敗しました: ${response.status} ${(await response.text()).slice(0, 200)}`);
  const json = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const raw = json.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  const result = parseJsonObject(raw);
  const officialUrl = typeof result.officialUrl === "string" && /^https:\/\/[^\s]+$/i.test(result.officialUrl) ? result.officialUrl : null;
  const category = typeof result.category === "string" && (LOCAPASS_CATEGORIES as readonly string[]).includes(result.category) ? result.category : "カフェ・スイーツ";
  const name = typeof result.name === "string" && result.name.trim() ? result.name.trim().slice(0, 120) : null;
  const address = typeof result.address === "string" && /\d/.test(result.address) ? result.address.trim().slice(0, 300) : null;
  return {
    name,
    address,
    officialUrl,
    category,
    reason: typeof result.reason === "string" ? result.reason.slice(0, 500) : "店名・住所を特定",
  };
}

/** 旧名の互換ラッパー。新しい呼び出しは identifyShopFromVideo を使う。 */
export async function findOfficialWebsite(title: string, name: string | null, address: string | null, description?: string | null) {
  return identifyShopFromVideo({ title, description, name, address });
}

/**
 * 取り込み時の掲載先ポータル(2026-11-05 運営判断)。
 * 渋谷区の店は渋谷、横浜市の店は横浜、それ以外(池袋・神楽坂・吉祥寺など)はロカパス(公式)ポータルに入れる。
 * 地図は全ポータル共通なので、どこに入れても地図には出る。
 */
export const LOCAPASS_HUB_PORTAL_ID = 55;
export function intakePortalForAddress(address: string) {
  const a = normalizeAddress(address).replace(/^〒\s*\d{3}-?\d{4}\s*/, "");
  if (/^東京都渋谷区/.test(a)) return 407;
  if (/^神奈川県横浜市|^横浜市/.test(a)) return 399;
  return LOCAPASS_HUB_PORTAL_ID;
}

/** 住所から座標を求めて店舗に保存する(既に座標がある店舗は触らない)。地図に出すための最後の一手。 */
export async function geocodeShopIfMissing(shopId: string) {
  const admin = createAdminClient();
  const { data: shop } = await admin.from("locapass_shops").select("id, address, lat, lng").eq("id", shopId).maybeSingle();
  if (!shop?.address || (shop.lat !== null && shop.lng !== null)) return shop ? { lat: shop.lat, lng: shop.lng } : null;
  const hit = await geocodeAddress(shop.address);
  if (!hit) return null;
  const { data, error } = await admin.from("locapass_shops").update({ lat: hit.lat, lng: hit.lng }).eq("id", shopId).select("id");
  if (error || !data?.length) throw new Error(`座標の保存に失敗しました: ${error?.message ?? "0件"}`);
  return { lat: hit.lat, lng: hit.lng };
}

/**
 * 新規発行した店舗の公式サイトから、空欄の詳細情報だけを自動補完する。
 * 既存入力は上書きせず、画像は権利確認が必要なため自動取込の対象外にする。
 */
export async function importOfficialProfileIfMissing(shopId: string, officialUrl: string) {
  if (!officialUrl || /(?:facebook|instagram|tiktok|twitter|x\.com)/i.test(officialUrl)) {
    return { applied: [], error: "SNS URLは自動取込の対象外です" };
  }
  const admin = createAdminClient();
  const { data: shop, error: shopError } = await admin
    .from("locapass_shops")
    .select("id, description, business_hours, tel")
    .eq("id", shopId)
    .maybeSingle();
  if (shopError || !shop) return { applied: [], error: shopError?.message ?? "店舗が見つかりません" };

  try {
    const preview = await previewShopImport(officialUrl);
    const patch: { description?: string; business_hours?: string; tel?: string } = {};
    const applied: string[] = [];
    if (!shop.description && preview.description) { patch.description = preview.description; applied.push("紹介文"); }
    if (!shop.business_hours && preview.business_hours) { patch.business_hours = preview.business_hours; applied.push("営業時間"); }
    if (!shop.tel && preview.phone) { patch.tel = preview.phone; applied.push("電話番号"); }
    if (Object.keys(patch).length > 0) {
      const { error } = await admin.from("locapass_shops").update(patch).eq("id", shopId);
      if (error) return { applied: [], error: error.message };
    }

    if (preview.price_items.length > 0) {
      const { data: existing } = await admin.from("locapass_shop_price_items").select("name, display_order").eq("shop_id", shopId);
      const names = new Set((existing ?? []).map((item) => item.name));
      const start = Math.max(0, ...(existing ?? []).map((item) => item.display_order ?? 0)) + 1;
      const rows = preview.price_items.filter((item) => item.name && item.price > 0 && !names.has(item.name)).slice(0, 20);
      if (rows.length > 0) {
        const { error } = await admin.from("locapass_shop_price_items").insert(rows.map((item, index) => ({
          shop_id: shopId,
          name: item.name.slice(0, 60),
          duration_minutes: item.duration_minutes,
          price: item.price,
          display_order: start + index,
        })));
        if (error) return { applied, error: error.message };
        applied.push(`料金表${rows.length}件`);
      }
    }
    return { applied, error: null };
  } catch (error) {
    return { applied: [], error: error instanceof Error ? error.message : "公式サイトの読み取りに失敗しました" };
  }
}

/** 確定済みの既存店舗に、同じYouTube動画を二重投稿せずリールとして紐づける。 */
export async function publishYoutubeIngestion(ingestionId: string, userId: string) {
  const admin = createAdminClient();
  const { data, error } = await (admin as any).from("locapass_youtube_ingestions").select("*").eq("id", ingestionId).maybeSingle();
  const row = data as IngestionRow | null;
  if (error || !row) throw new Error(error?.message ?? "候補が見つかりません");
  if (row.reel_id) return row.reel_id;
  if (!row.matched_shop_id) throw new Error("店舗を確定してから投稿してください");

  const { data: duplicate } = await (admin as any)
    .from("locapass_reels")
    .select("id")
    .eq("portal_id", row.portal_id)
    .eq("embed_provider", "youtube")
    .eq("embed_ref", row.youtube_id)
    .maybeSingle();
  if (duplicate?.id) {
    await (admin as any).from("locapass_youtube_ingestions").update({ reel_id: duplicate.id, reviewed_at: new Date().toISOString(), reviewed_by: userId }).eq("id", row.id);
    return duplicate.id as string;
  }

  const form = new FormData();
  form.set("kind", "reel");
  form.set("video_url", row.video_url);
  form.set("text", `YouTubeで紹介された ${row.title}`.slice(0, 500));
  await createEmbedPostForShop(admin as any, row.matched_shop_id, form);
  const { data: reel, error: reelError } = await (admin as any).from("locapass_reels").select("id").eq("portal_id", row.portal_id).eq("embed_provider", "youtube").eq("embed_ref", row.youtube_id).order("published_at", { ascending: false }).limit(1).maybeSingle();
  if (reelError || !reel?.id) throw new Error(reelError?.message ?? "リールIDを取得できませんでした");
  const { error: updateError } = await (admin as any).from("locapass_youtube_ingestions").update({ reel_id: reel.id, match_status: "matched_existing", reviewed_at: new Date().toISOString(), reviewed_by: userId, error_message: null }).eq("id", row.id);
  if (updateError) throw new Error(`投稿結果の保存に失敗しました: ${updateError.message}`);
  return reel.id as string;
}


