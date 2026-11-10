import { createEmbedPostForShop } from "@/lib/embed-post/createEmbedPost";
import { createAdminClient } from "@/lib/supabase/admin";
import { geocodeAddress, normalizeAddress } from "@/lib/map/addressGeocode";
import { LOCAPASS_CATEGORIES } from "@/lib/shop/locapassCategories";
import { previewShopImport, type ImportPreview } from "@/lib/shop/importFromWebsite";
import { enrichNewShop } from "@/lib/shop/enrichNewShop";
import { addressKey, filterSameShop, hasStreetNumber, safeSearchTerm, searchTerms, type ShopRow } from "@/lib/youtube/shopMatch";
import { randomBytes } from "node:crypto";
import { cleanAutoCaption, composeIntro, menuHintsFromText } from "@/lib/reels/seoCaption";
import { getShopCuisineLabels } from "@/lib/verticals/shopCuisine";
import { getBlockedChannelTitles } from "./stockHygiene";

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
  youtube_id: string | null;
  source_provider: string;
  source_id: string | null;
  thumbnail_url: string | null;
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

/**
 * 動画1本の説明欄をYouTube Data APIで取る(手動のURL追加はoEmbedでタイトルしか取れないため)。
 * 取れなかった・説明欄が空・APIキー未設定のときは空文字を返し、呼び出し側を止めない。
 */
export async function fetchYoutubeDescription(youtubeId: string): Promise<string> {
  try {
    const details = await youtubeJson<YoutubeVideoResponse>("videos", { part: "snippet", id: youtubeId, maxResults: "1" });
    return cleanText(details.items?.[0]?.snippet?.description ?? "");
  } catch {
    return "";
  }
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
    // 3分未満だけに絞る(後段でも180秒以下に絞るが、検索結果の枠をShortsで埋めるため先に指定する)。
    videoDuration: "short",
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

/** Health & Beauty ポータル。美容系の動画はここに入れる。 */
export const BEAUTY_PORTAL_ID = 408;

export const TOKYO_BEAUTY_QUERIES = [
  "東京 美容室",
  "東京 ヘアサロン",
  "東京 ネイルサロン",
  "東京 エステ",
  "東京 アイラッシュ",
  "東京 バーバー",
  "東京 ヘッドスパ",
  "東京 メンズ美容",
] as const;

/** 東京のビューティー系を新着順で収集し、Health & Beautyポータルへストックする。店舗特定・公開は processPendingIngestions が行う。 */
export async function collectTokyoBeautyStock(options?: {
  portalId?: number;
  perQuery?: number;
  publishedAfter?: string;
  queries?: readonly string[];
}) {
  const queries = options?.queries?.length ? options.queries : TOKYO_BEAUTY_QUERIES;
  const portalId = options?.portalId ?? BEAUTY_PORTAL_ID;
  const perQuery = Math.min(Math.max(options?.perQuery ?? 25, 1), 50);
  const publishedAfter = options?.publishedAfter ?? new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
  let fetched = 0;
  let saved = 0;
  const errors: string[] = [];
  for (const query of queries) {
    // 1つの検索語が失敗(クォータ・一時的なエラー)しても、残りの検索語と後段の公開処理は続ける。
    try {
      const candidates = await collectYoutubeCandidates(query, perQuery, publishedAfter);
      fetched += candidates.length;
      saved += await saveYoutubeCandidates(portalId, candidates);
    } catch (error) {
      errors.push(`${query}: ${error instanceof Error ? error.message.slice(0, 160) : "収集に失敗"}`);
    }
  }
  return { portalId, queries: queries.length, fetched, saved, publishedAfter, errors };
}

/** 東京のカフェ・グルメ系の検索語。定期収集(/api/cron/youtube-gourmet)が使う。 */
export const TOKYO_GOURMET_QUERIES = [
  "東京 カフェ",
  "東京 グルメ",
  "東京 ランチ",
  "東京 スイーツ",
  "東京 居酒屋",
  "東京 ラーメン",
  "東京 パン屋",
  "東京 ディナー",
] as const;

/**
 * 東京のカフェ・グルメ系を新着順で収集し、ロカパス(ハブ)ポータルへストックする(手動収集の初期ポータルと同じ)。
 * 店舗特定・公開は processPendingIngestions が行う(定期実行では、この収集で入れた分だけを処理する)。
 */
export async function collectTokyoGourmetStock(options?: { portalId?: number; perQuery?: number; publishedAfter?: string; queries?: readonly string[] }) {
  const queries = options?.queries?.length ? options.queries : TOKYO_GOURMET_QUERIES;
  const portalId = options?.portalId ?? LOCAPASS_HUB_PORTAL_ID;
  const perQuery = Math.min(Math.max(options?.perQuery ?? 25, 1), 50);
  const publishedAfter = options?.publishedAfter ?? new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
  let fetched = 0;
  let saved = 0;
  const errors: string[] = [];
  for (const query of queries) {
    // 1つの検索語が失敗(クォータ・一時的なエラー)しても、残りの検索語と後段の公開処理は続ける。
    try {
      const candidates = await collectYoutubeCandidates(query, perQuery, publishedAfter);
      fetched += candidates.length;
      saved += await saveYoutubeCandidates(portalId, candidates);
    } catch (error) {
      errors.push(`${query}: ${error instanceof Error ? error.message.slice(0, 160) : "収集に失敗"}`);
    }
  }
  return { portalId, queries: queries.length, fetched, saved, publishedAfter, errors };
}

/** 管理画面から同一動画を何度集めても候補を増やさない。 */
export async function saveYoutubeCandidates(portalId: number, allCandidates: YoutubeCandidate[]) {
  const admin = createAdminClient();
  // 「今後収集しない」にしたチャンネルの動画は、候補に入れない。
  const blocked = new Set(await getBlockedChannelTitles());
  const candidates = allCandidates.filter((video) => !(video.channelTitle && blocked.has(video.channelTitle)));
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
  const youtubeIds = rows.map((row) => row.youtube_id);
  const { data: existing, error: existingError } = await (admin as any)
    .from("locapass_youtube_ingestions")
    .select("youtube_id")
    .eq("portal_id", portalId)
    .in("youtube_id", youtubeIds);
  if (existingError) throw new Error(`既存候補の確認に失敗しました: ${existingError.message}`);
  const existingIds = new Set((existing ?? []).map((row: { youtube_id: string }) => row.youtube_id));
  const saved = rows.filter((row) => !existingIds.has(row.youtube_id)).length;
  const { error } = await (admin as any).from("locapass_youtube_ingestions").upsert(rows, { onConflict: "portal_id,youtube_id", ignoreDuplicates: true });
  if (error) throw new Error(`候補の保存に失敗しました: ${error.message}`);
  return saved;
}

/** カテゴリから業態(locapass_shops.business_type)を決める。00177の既存店舗の埋め方と同じ対応。 */
export function businessTypeForCategory(category: string) {
  if (["カフェ・スイーツ", "レストラン・食事", "居酒屋・バー"].includes(category)) return "food";
  if (category === "宿泊") return "stay";
  if (category === "美容・暮らし") return "beauty";
  if (category === "観光・体験") return "activity";
  if (category === "ショッピング") return "retail";
  return "other";
}

/** AIがカテゴリを返せなかったときの既定値。美容ポータルは美容、それ以外は従来どおりカフェ。 */
export function defaultCategoryForPortal(portalId: number) {
  return portalId === BEAUTY_PORTAL_ID ? "美容・暮らし" : "カフェ・スイーツ";
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message.slice(0, 500) : fallback;
}

/**
 * 店名と住所から店舗を新規登録する(ログインユーザー不要。cron からも使える)。
 * 店舗発行RPCは portal admin のログインを要求するため、サービスロールで直接 insert する。
 * 座標・公式サイトの詳細・英語住所の補完まで行い、失敗は候補の error_message に残す(登録は止めない)。
 */
export async function createShopForIngestion(ingestionId: string, input: {
  portalId: number;
  name: string;
  address: string;
  officialUrl?: string | null;
  category?: string | null;
  publish?: boolean;
  reason?: string | null;
  /** 公式サイトを既に読み取っているときは渡す(二重に取得しない)。 */
  preview?: ImportPreview | null;
}) {
  const admin = createAdminClient();
  const category = (LOCAPASS_CATEGORIES as readonly string[]).includes(input.category ?? "") ? (input.category as string) : defaultCategoryForPortal(input.portalId);
  const { data: inserted, error } = await (admin as any).from("locapass_shops").insert({
    portal_id: input.portalId,
    slug: randomBytes(5).toString("hex"),
    name: input.name.trim().slice(0, 120),
    category,
    address: input.address.trim().slice(0, 300),
    business_type: businessTypeForCategory(category),
    status: input.publish === false ? "draft" : "active",
    ...(input.officialUrl ? { url: input.officialUrl } : {}),
  }).select("id").single();
  if (error || !inserted?.id) throw new Error(`店舗の登録に失敗しました: ${error?.message ?? "0件"}`);
  const shopId = inserted.id as string;

  // 座標が取れないと地図に出ないので、失敗は候補側に記録して管理者が住所を直せるようにする。
  const coords = await geocodeShopIfMissing(shopId).catch(() => null);
  const imported = input.officialUrl ? await importOfficialProfileIfMissing(shopId, input.officialUrl, input.preview) : { applied: [] as string[], error: null };
  // 住所の英語表記・紹介文の翻訳を、登録と同時に埋める(Googleの写真は費用のため使わない)。
  const enriched = await enrichNewShop(admin as any, shopId).catch((e) => ({ note: e instanceof Error ? e.message : "補完に失敗" }));
  const notes = [
    coords ? null : "住所から座標を求められませんでした(地図に出ません)",
    imported.error ? `公式情報の自動取込: ${imported.error}` : null,
    imported.applied.length ? `公式サイトから補完: ${imported.applied.join("・")}` : null,
    "note" in enriched && enriched.note ? `不足項目の補完: ${enriched.note}` : null,
  ].filter(Boolean).join(" / ");
  const { error: ingestionError } = await (admin as any).from("locapass_youtube_ingestions").update({
    candidate_name: input.name,
    candidate_address: input.address,
    official_url: input.officialUrl ?? null,
    official_url_verified: Boolean(input.officialUrl),
    matched_shop_id: shopId,
    portal_id: input.portalId,
    match_status: "ready_to_create",
    ...(input.reason ? { match_reason: input.reason } : {}),
    error_message: notes || null,
  }).eq("id", ingestionId);
  if (ingestionError) throw new Error(`候補の更新に失敗しました: ${ingestionError.message}`);
  return shopId;
}

/**
 * 店名・住所が決まった候補を、既存店に一意に一致すればその店へ、無ければ新規登録して、リールとして公開する。
 * 既存店が複数一致するときは重複登録を避けて保留にする。
 */
export async function matchOrCreateAndPublish(ingestionId: string, input: {
  portalId: number;
  name: string;
  address: string;
  officialUrl?: string | null;
  category?: string | null;
  reason: string;
  userId: string | null;
  preview?: ImportPreview | null;
  /** 運営者が自分の操作で掲載するときは true(店舗の「動画の自動追加」オプションを問わない)。毎日の自動処理は false。 */
  ignoreOption?: boolean;
}): Promise<"published" | "held"> {
  const admin = createAdminClient();
  // 全ポータルから探す。複数ヒットしても、候補のポータル内で1件に絞れるならその店に紐づける。
  let existing = await findExistingShop(input.portalId, input.name, input.address, input.officialUrl);
  const inPortal = existing.filter((shop) => shop.portal_id === input.portalId);
  if (existing.length > 1 && inPortal.length === 1) existing = inPortal;
  if (existing.length > 1) {
    const list = existing.slice(0, 4).map((shop) => `${shop.name}(ポータル${shop.portal_id}・${shop.id})`).join(" / ");
    await (admin as any).from("locapass_youtube_ingestions").update({
      candidate_name: input.name, candidate_address: input.address, official_url: input.officialUrl ?? null,
      match_reason: input.reason.slice(0, 500), error_message: `既存店舗が${existing.length}件一致したため、重複登録を避けて保留(既存店舗IDを手動で紐づけてください): ${list}`.slice(0, 500),
    }).eq("id", ingestionId);
    return "held";
  }
  if (existing.length === 1 && !input.ignoreOption) {
    // 自動追加はオプション契約の店舗だけ。未契約の店は、紐づけまで行って公開は見送る(運営が確認して「リールを投稿」で追加できる)。
    const { data: optionRow } = await (admin as any).from("locapass_shops").select("auto_video_enabled").eq("id", existing[0].id).maybeSingle();
    if (!optionRow?.auto_video_enabled) {
      const { error: holdError } = await (admin as any).from("locapass_youtube_ingestions").update({
        portal_id: input.portalId, candidate_name: input.name, candidate_address: input.address,
        official_url: input.officialUrl ?? existing[0].url, official_url_verified: Boolean(input.officialUrl ?? existing[0].url),
        matched_shop_id: existing[0].id, match_status: "matched_existing",
        match_reason: `既存店舗に一意一致(「動画の自動追加」オプション未契約のため、公開せず保留): ${input.reason}`.slice(0, 500),
        error_message: null,
      }).eq("id", ingestionId);
      if (holdError) throw new Error(`候補の更新に失敗しました: ${holdError.message}`);
      return "held";
    }
  }
  if (existing.length === 1) {
    // リールは店舗のポータルに作られるので、候補のポータルも既存店舗のものに合わせる。
    const { error } = await (admin as any).from("locapass_youtube_ingestions").update({
      portal_id: existing[0].portal_id, candidate_name: input.name, candidate_address: input.address,
      official_url: input.officialUrl ?? existing[0].url, official_url_verified: Boolean(input.officialUrl ?? existing[0].url),
      matched_shop_id: existing[0].id, match_status: "matched_existing",
      match_reason: `店名・住所が既存店舗に一意一致: ${input.reason}`.slice(0, 500),
      reviewed_at: new Date().toISOString(), reviewed_by: input.userId, error_message: null,
    }).eq("id", ingestionId);
    if (error?.code === "23505") throw new Error(`既存店舗(ポータル${existing[0].portal_id})に紐づけようとしましたが、そのポータルには同じ動画がすでにあります`);
    if (error) throw new Error(`候補の更新に失敗しました: ${error.message}`);
  } else {
    await createShopForIngestion(ingestionId, { ...input, publish: true });
    await (admin as any).from("locapass_youtube_ingestions").update({ reviewed_at: new Date().toISOString(), reviewed_by: input.userId, match_reason: input.reason.slice(0, 500) }).eq("id", ingestionId);
  }
  await publishYoutubeIngestion(ingestionId, input.userId);
  return "published";
}

type PendingRow = { id: string; portal_id: number; title: string; description: string | null; candidate_name: string | null; candidate_address: string | null };

/** 1件の保留候補をAIで判定し、店名・住所が確かなら公開まで進める。失敗は候補のerror_messageに残す。 */
export async function processPendingIngestion(row: PendingRow, userId: string | null): Promise<"published" | "held" | "error"> {
  const admin = createAdminClient();
  try {
    const hint = extractShopHint(row.title, row.description ?? "");
    const result = await identifyShopFromVideo({ title: row.title, description: row.description, name: hint.name ?? row.candidate_name, address: hint.address ?? row.candidate_address });
    if (!result.name || !result.address || !result.confident) {
      const why = !result.name || !result.address ? "店名・住所を特定できないため保留" : "店名・住所の裏付けが弱い(推測)ため保留。公式サイトURLを貼って保存すると自動で取得します";
      await (admin as any).from("locapass_youtube_ingestions").update({ candidate_name: result.name, candidate_address: result.address, official_url: result.officialUrl, match_reason: result.reason || why, error_message: why }).eq("id", row.id);
      return "held";
    }
    // 収集時に選ばれたポータルを維持する(美容系はHealth & Beautyのまま。住所で渋谷/横浜へ移すとカテゴリ別ポータルの意図が崩れる)。
    return await matchOrCreateAndPublish(row.id, {
      portalId: row.portal_id || intakePortalForAddress(result.address),
      name: result.name, address: result.address, officialUrl: result.officialUrl, category: result.category, reason: result.reason, userId,
    });
  } catch (error) {
    const message = errorText(error, "自動処理に失敗しました");
    console.error(`YouTube候補の自動処理に失敗しました(${row.id}): ${message}`);
    await (admin as any).from("locapass_youtube_ingestions").update({ error_message: message }).eq("id", row.id);
    return "error";
  }
}

/**
 * 未判定の保留(match_reasonなし)を新しい順に処理して公開する。管理画面のボタンとcronの両方から使う。
 * Geminiを続けて呼ぶので、件数とともに経過時間でも打ち切る(serverless の上限内に収める)。
 */
export async function processPendingIngestions(options: {
  portalId?: number | null;
  limit: number;
  userId: string | null;
  budgetMs?: number;
  /** 指定すると、この検索語で収集した候補だけを処理する(手動で集めた古い未判定の候補を巻き込まない)。 */
  sourceQueries?: readonly string[];
  /** 指定すると、この日時以降に収集した候補だけを処理する(ISO文字列)。 */
  createdAfter?: string;
}) {
  const started = Date.now();
  const budgetMs = options.budgetMs ?? 200_000;
  const admin = createAdminClient();
  let query = (admin as any).from("locapass_youtube_ingestions")
    .select("id, portal_id, title, description, candidate_name, candidate_address")
    .eq("match_status", "pending")
    .is("match_reason", null)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(options.limit, 1), 50));
  if (options.portalId) query = query.eq("portal_id", options.portalId);
  if (options.sourceQueries?.length) query = query.in("source_query", [...options.sourceQueries]);
  if (options.createdAfter) query = query.gte("created_at", options.createdAfter);
  const { data: rows, error } = await query;
  if (error) throw new Error(`保留候補の取得に失敗しました: ${error.message}`);
  const summary = { scanned: 0, published: 0, held: 0, errors: 0 };
  for (const row of (rows ?? []) as PendingRow[]) {
    if (Date.now() - started > budgetMs) break;
    summary.scanned += 1;
    const outcome = await processPendingIngestion(row, options.userId);
    if (outcome === "published") summary.published += 1;
    else if (outcome === "held") summary.held += 1;
    else summary.errors += 1;
  }
  return summary;
}

export type OfficialSiteResolution = {
  name: string | null;
  address: string | null;
  category: string | null;
  preview: ImportPreview | null;
  /** 取得できなかった理由など、カードに出すメモ。 */
  note: string | null;
};

/**
 * 公式サイトのURLから、店名・住所・業種(と営業時間などの詳細)を読み取る。
 * 動画のタイトル・説明欄・既存の候補値は、複数支店のサイトで1店舗を選ぶ手がかりにする。
 * サイトに住所が無いときは、店名とサイトURLからGoogle検索で補う。
 */
export async function resolveShopFromOfficialSite(input: { officialUrl: string; title: string; description?: string | null; name?: string | null; address?: string | null }): Promise<OfficialSiteResolution> {
  const hint = [input.name, input.address, input.title].filter(Boolean).join(" / ");
  let preview: ImportPreview | null = null;
  let note: string | null = null;
  try {
    preview = await previewShopImport(input.officialUrl, { hint });
  } catch (error) {
    note = `公式サイトの読み取りに失敗: ${errorText(error, "不明なエラー")}`;
  }
  let name = preview?.name ?? input.name ?? null;
  let address = preview?.address ?? null;
  const category = preview?.category ?? null;
  if (name && !address) {
    try {
      const searched = await identifyShopFromVideo({ title: input.title, description: input.description, name, address: input.address, officialUrl: input.officialUrl });
      address = searched.address;
      name = searched.name ?? name;
    } catch (error) {
      note = note ?? `住所の検索に失敗: ${errorText(error, "不明なエラー")}`;
    }
  }
  if (!note && (!name || !address)) note = `公式サイトから${!name ? "店名" : "住所"}を読み取れませんでした。手入力してください`;
  return { name, address, category, preview, note };
}

/**
 * 店名・住所・公式URLに基づく、登録済みの同じ店の候補。
 * 全ポータルを対象に探す(同じ店がポータルをまたいで二重登録されるのを防ぐ)。同じポータルの店を先に並べる。
 * 住所は番地まで・表記ゆれを無視して比べ、住所が一致して店名が似ている(または公式サイトのドメインが同じ)ものだけを返す。
 * 判定の中身は shopMatch.ts。
 */
export async function findExistingShop(portalId: number, name: string, address?: string | null, officialUrl?: string | null): Promise<ShopRow[]> {
  const admin = createAdminClient();
  const conditions = searchTerms(name).map((term) => `name.ilike."%${term}%"`);
  // 店名の表記が大きく違っても住所で拾えるように、番地までの住所でも探す(最終判定は filterSameShop)。
  const street = addressKey(address);
  if (hasStreetNumber(street)) {
    const term = safeSearchTerm(street);
    if (term) conditions.push(`address.ilike."%${term}%"`);
  }
  if (conditions.length === 0) return [];
  const { data, error } = await admin.from("locapass_shops").select("id, name, address, url, status, portal_id").or(conditions.join(",")).limit(300);
  if (error) throw new Error(`既存店舗の検索に失敗しました: ${error.message}`);
  let matched = filterSameShop((data ?? []) as ShopRow[], { name, address, officialUrl });
  // 重複の整理で下書きにした店などは、公開中の一致があれば無視する(公開中が無いときだけ下書きも候補にする)。
  if (matched.some((shop) => shop.status === "active")) matched = matched.filter((shop) => shop.status === "active");
  return matched.sort((a, b) => Number(b.portal_id === portalId) - Number(a.portal_id === portalId)).slice(0, 10);
}

export type ShopIdentification = {
  name: string | null;
  address: string | null;
  officialUrl: string | null;
  category: string;
  reason: string;
  /** 店名・住所が説明欄や公式情報で裏付けられているか。false(推測)なら自動公開せず保留にする。 */
  confident: boolean;
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
export async function identifyShopFromVideo(input: { title: string; description?: string | null; name?: string | null; address?: string | null; officialUrl?: string | null }): Promise<ShopIdentification> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY が未設定です");
  const prompt = [
    "YouTube/TikTokの紹介動画で取り上げられた、日本国内の店舗(飲食店・カフェ・美容室・ネイル・エステ・まつげ・バーバー・ペット施設・体験施設など)を1店舗特定してください。",
    "説明欄に店名・住所が書いてあればそれを最優先で使い、足りない部分だけGoogle検索で補ってください。",
    "",
    `動画タイトル: ${input.title}`,
    `説明欄: ${(input.description ?? "").slice(0, 2500) || "なし"}`,
    `店名候補: ${input.name ?? "不明"}`,
    `住所候補: ${input.address ?? "不明"}`,
    ...(input.officialUrl ? [`公式サイト: ${input.officialUrl}(この店舗の公式サイト。このサイトの店舗として特定する)`] : []),
    "",
    "判定ルール:",
    "- 店名と住所(都道府県から番地まで)が分かれば十分です。公式サイトや支店の確認が取れなくても構いません。",
    "- 住所は営業時間・最寄り駅・電話番号などを含めず、建物名と階数までにしてください。",
    "- チェーン店は動画に出てくる支店名と、その支店の住所にしてください。支店が絞り込めない場合だけ null にしてください。",
    "- 複数の店舗を紹介する動画(〇選・TOP3・はしご等)や、店舗の紹介ではない動画は name と address を null にしてください。",
    "- タイトル・説明欄・検索結果のどれにも店名の裏付けが無く、動画の雰囲気などからの推測でしか決められない場合は、name/address を null にしてください(推測で店舗を作らない)。",
    "- confident は、店名と住所が説明欄・公式サイト・検索結果ではっきり確認できたときだけ true。迷うときは false。",
    "- officialUrl は店舗または運営会社の公式サイトが見つかった場合のみ。無ければ null(グルメサイト・SNS・地図は不可)。",
    `- category は次のどれか1つ: ${LOCAPASS_CATEGORIES.join(" / ")}`,
    "",
    "出力は次のJSONだけにしてください(前後に文章を付けない)。",
    '{"name":string|null,"address":string|null,"officialUrl":string|null,"category":string,"confident":boolean,"reason":string}',
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
    confident: result.confident === true,
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
export async function importOfficialProfileIfMissing(shopId: string, officialUrl: string, prefetched?: ImportPreview | null) {
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
    const preview = prefetched ?? await previewShopImport(officialUrl);
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
export async function publishYoutubeIngestion(ingestionId: string, userId: string | null) {
  return publishYoutubeIngestionImpl(ingestionId, userId);
}

/**
 * 元動画のタイトル・説明欄から、リール用の短い紹介文(日本語)を作る。
 * 説明欄の丸写しではなく、書かれている事実(おすすめメニュー・雰囲気など)だけを要約する。
 * 説明欄が空・AIの失敗・結果が不自然なときは null を返し、呼び出し側が従来の固定文に戻す。
 */
export async function composeReelCaption(input: { title: string; description: string | null; shopName: string | null; address: string | null }): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  const description = (input.description ?? "").trim();
  if (!key || description.length < 10) return null;
  const prompt = [
    "YouTube/TikTokの紹介動画を、お店のリール投稿として載せるための短い紹介文を日本語で書いてください。",
    "",
    `店名: ${input.shopName ?? "不明"}`,
    `住所: ${input.address ?? "不明"}`,
    `動画タイトル: ${input.title}`,
    `説明欄: ${description.slice(0, 2500)}`,
    "",
    "ルール:",
    "- 説明欄・タイトルに書かれている事実だけを使う。書かれていないメニュー・価格・営業時間・感想を付け足さない。",
    "- 説明欄の文章をそのまま写さず、自分の言葉で短くまとめる。",
    "- おすすめのメニュー、雰囲気、場所の特徴など、見る人の役に立つ情報を優先する。",
    "- 一番の魅力(景色、名物メニュー、居心地など、説明欄で一番推されていること)を出だしに置く。",
    "- 見た人が「また行きたい」「行ってみたい」と感じる、やわらかく温かい口調にする。友達におすすめを教える感じで、堅い説明調・箇条書き調にしない。",
    "- やわらかい口調にしても、説明欄にない事実(味の評価、混み具合、価格など)は足さない。誇張や「絶対」「最高」などの言い切りもしない。",
    "- ハッシュタグ、URL、メール、電話番号、チャンネル登録・高評価のお願い、タイアップ・PR表記、他SNSへの誘導は入れない。",
    "- 2〜3文、140文字以内。絵文字は使わない。文頭に「YouTubeで紹介された」などの決まり文句を付けない。",
    "- 店の情報が読み取れない(説明欄が宣伝・定型文だけ等)場合は空文字を返す。",
    "",
    '出力は次のJSONだけにしてください。{"caption":string}',
  ].join("\n");
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 512, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return null;
    const json = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const raw = json.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    const caption = parseJsonObject(raw).caption;
    if (typeof caption !== "string") return null;
    const text = caption.replace(/https?:\/\/\S+/g, "").replace(/[#＃]\S+/g, "").replace(/\s+/g, " ").trim();
    return text.length >= 8 && text.length <= 200 ? text : null;
  } catch {
    return null;
  }
}

async function publishYoutubeIngestionImpl(ingestionId: string, userId: string | null) {
  const admin = createAdminClient();
  const { data, error } = await (admin as any).from("locapass_youtube_ingestions").select("*").eq("id", ingestionId).maybeSingle();
  const row = data as IngestionRow | null;
  if (error || !row) throw new Error(error?.message ?? "候補が見つかりません");
  if (row.reel_id) return row.reel_id;
  if (!row.matched_shop_id) throw new Error("店舗を確定してから投稿してください");
  // YouTubeはyoutube_id、TikTokはsource_id(動画ID)で、同じ動画の二重投稿を防ぐ。
  const provider = row.source_provider === "tiktok" ? "tiktok" : "youtube";
  const ref = provider === "tiktok" ? row.source_id : row.youtube_id;
  if (!ref) throw new Error("動画IDが取得できていません");

  // リールは店舗のポータルに作られる(createEmbedPostForShop)。候補のポータルと店舗のポータルが違っても探せるよう、店舗側で調べる。
  const { data: shopRow } = await admin.from("locapass_shops").select("portal_id").eq("id", row.matched_shop_id).maybeSingle();
  if (!shopRow) throw new Error("紐づけた店舗が見つかりません(店舗IDを確認してください)");
  const reelPortalId = shopRow.portal_id as number;

  const { data: duplicate } = await (admin as any)
    .from("locapass_reels")
    .select("id")
    .eq("portal_id", reelPortalId)
    .eq("embed_provider", provider)
    .eq("embed_ref", ref)
    .maybeSingle();
  if (duplicate?.id) {
    await (admin as any).from("locapass_youtube_ingestions").update({ reel_id: duplicate.id, reviewed_at: new Date().toISOString(), reviewed_by: userId }).eq("id", row.id);
    return duplicate.id as string;
  }

  const form = new FormData();
  form.set("kind", "reel");
  form.set("video_url", row.video_url);
  const { data: shopInfo } = await admin.from("locapass_shops").select("name, address, category").eq("id", row.matched_shop_id).maybeSingle();
  // 手動追加などで説明欄が空のまま保存されている動画は、投稿の直前に取り直して保存する(次回以降の店舗特定にも使える)。
  let description = row.description;
  if (!description?.trim() && provider === "youtube" && row.youtube_id) {
    description = await fetchYoutubeDescription(row.youtube_id) || null;
    if (description) await (admin as any).from("locapass_youtube_ingestions").update({ description }).eq("id", row.id);
  }
  const caption = await composeReelCaption({ title: row.title, description, shopName: shopInfo?.name ?? null, address: shopInfo?.address ?? null });
  // 説明欄からAIがまとめた紹介文があればそれを使い、無ければ店の情報(店名・エリア・料理・タイトルのハッシュタグ)から紹介文を組み立てる。
  // 以前の「YouTubeで紹介された+タイトル(ハッシュタグ入り)」の行は付けない(検索結果にも出るため、生ログのままにしない)。
  const intro = caption ?? composeIntro({
    shopName: shopInfo?.name,
    address: shopInfo?.address,
    category: shopInfo?.category,
    cuisines: await getShopCuisineLabels(admin, row.matched_shop_id),
    menuHints: menuHintsFromText(`${row.title} ${(description ?? "").slice(0, 600)}`),
    seed: ref,
  });
  form.set("text", (intro ?? cleanAutoCaption(row.title) ?? "").slice(0, 500));
  await createEmbedPostForShop(admin as any, row.matched_shop_id, form);
  const { data: reel, error: reelError } = await (admin as any).from("locapass_reels").select("id").eq("portal_id", reelPortalId).eq("embed_provider", provider).eq("embed_ref", ref).order("published_at", { ascending: false }).limit(1).maybeSingle();
  if (reelError || !reel?.id) throw new Error(reelError?.message ?? "リールIDを取得できませんでした");
  // 管理者が切り取って設定したサムネイル(自前のストレージ)があれば、リールのサムネイルにする。
  // TikTokの旧oEmbedの画像URLは期限切れになるため、自前のストレージのものだけを使う。
  if (row.thumbnail_url?.includes("/embed-thumbs/")) {
    await (admin as any).from("locapass_reels").update({ poster_url: row.thumbnail_url }).eq("id", reel.id);
  }
  const { error: updateError } = await (admin as any).from("locapass_youtube_ingestions").update({ reel_id: reel.id, match_status: "matched_existing", reviewed_at: new Date().toISOString(), reviewed_by: userId, error_message: null }).eq("id", row.id);
  if (updateError) throw new Error(`投稿結果の保存に失敗しました: ${updateError.message}`);
  return reel.id as string;
}



/** 定期収集の種類。管理画面の「定期収集の検索語」と1対1。 */
export type CollectJob = "gourmet" | "beauty";
export const COLLECT_JOB_DEFAULTS: Record<CollectJob, readonly string[]> = { gourmet: TOKYO_GOURMET_QUERIES, beauty: TOKYO_BEAUTY_QUERIES };
/** YouTube検索は1回100クォータ(1日1万)。入れすぎて枯渇しないよう、1種類あたりの語数に上限を置く。 */
export const MAX_COLLECT_QUERIES = 12;

/** 保存済みの検索語を返す。未設定・テーブル未作成・読み込み失敗のときは、コードの初期値を使う(収集を止めない)。 */
export async function getCollectQueries(job: CollectJob): Promise<{ queries: readonly string[]; isCustom: boolean }> {
  try {
    const { data, error } = await (createAdminClient() as any).from("locapass_youtube_collect_queries").select("queries").eq("job", job).maybeSingle();
    if (error) throw error;
    const saved = ((data?.queries ?? []) as string[]).map((q) => q.trim()).filter(Boolean);
    if (saved.length > 0) return { queries: saved, isCustom: true };
  } catch (error) {
    console.error(`定期収集の検索語を読めなかったので初期値を使います(${job})`, error);
  }
  return { queries: COLLECT_JOB_DEFAULTS[job], isCustom: false };
}
