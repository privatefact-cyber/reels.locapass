import { createEmbedPostForShop } from "@/lib/embed-post/createEmbedPost";
import { createAdminClient } from "@/lib/supabase/admin";

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
const SHIBUYA_PORTAL_ID = 407;

function apiKey() {
  const key = process.env.YOUTUBE_DATA_API_KEY;
  if (!key) throw new Error("YOUTUBE_DATA_API_KEY が未設定です");
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

/** 動画のタイトルと説明欄から、確認画面で使う店舗名の候補だけを控えめに拾う。 */
export function extractShopHint(title: string, description: string): { name: string | null; address: string | null } {
  const source = `${title}\n${description}`;
  const name = source.match(/(?:店名|店舗名|店:\s*|店は)[：:\s]*([^\n#]{2,60})/i)?.[1];
  const address = source.match(/(?:住所|アクセス|所在地)[：:\s]*([^\n]{6,120})/i)?.[1];
  return { name: name ? cleanText(name).replace(/[。！!].*$/, "").trim() : null, address: address ? cleanText(address).trim() : null };
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
export async function collectYoutubeCandidates(query: string, maxResults = 50): Promise<YoutubeCandidate[]> {
  const search = await youtubeJson<YoutubeSearchResponse>("search", {
    part: "id",
    q: query,
    type: "video",
    regionCode: "JP",
    relevanceLanguage: "ja",
    maxResults: String(Math.min(Math.max(maxResults, 1), 50)),
    order: "date",
    videoEmbeddable: "true",
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

/** Google検索の根拠から、公式サイト候補だけを管理者確認用に返す。結果は自動で「確認済み」にしない。 */
export async function findOfficialWebsite(title: string, name: string | null, address: string | null) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY が未設定です");
  const prompt = `YouTubeの紹介動画について、紹介された日本国内の飲食店・カフェを特定し、その店舗または支店の公式サイトを探してください。\n動画タイトル: ${title}\n店名候補: ${name ?? "不明"}\n地域・住所候補: ${address ?? "不明"}\n\n公式運営元のサイトだけを候補にし、グルメサイト、地図、SNS、まとめサイトは除外してください。店名または支店・住所を確認できない場合は null にしてください。出力は次のJSONだけにしてください。\n{"name":string|null,"address":string|null,"officialUrl":string|null,"reason":string}`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { responseMimeType: "application/json", temperature: 0, maxOutputTokens: 500, thinkingConfig: { thinkingBudget: 0 } },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`公式サイトの検索に失敗しました: ${response.status}`);
  const json = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const raw = json.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  let result: { name?: unknown; address?: unknown; officialUrl?: unknown; reason?: unknown };
  try { result = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "")); } catch { throw new Error("公式サイト検索の結果を読み取れませんでした"); }
  const officialUrl = typeof result.officialUrl === "string" && /^https:\/\/[^\s]+$/i.test(result.officialUrl) ? result.officialUrl : null;
  return {
    name: typeof result.name === "string" ? result.name.slice(0, 120) : name,
    address: typeof result.address === "string" ? result.address.slice(0, 300) : address,
    officialUrl,
    reason: typeof result.reason === "string" ? result.reason.slice(0, 500) : "公式サイト候補を検索",
  };
}

/** 確定済みの既存店舗に、同じYouTube動画を二重投稿せずリールとして紐づける。 */
export async function publishYoutubeIngestion(ingestionId: string, userId: string) {
  const admin = createAdminClient();
  const { data, error } = await (admin as any).from("locapass_youtube_ingestions").select("*").eq("id", ingestionId).maybeSingle();
  const row = data as IngestionRow | null;
  if (error || !row) throw new Error(error?.message ?? "候補が見つかりません");
  if (row.portal_id !== SHIBUYA_PORTAL_ID) throw new Error("この初回運用は渋谷ポータルだけに限定しています");
  if (row.reel_id) return row.reel_id;
  if (!row.matched_shop_id || !row.official_url_verified) throw new Error("店舗と公式サイトを確認してから投稿してください");

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
  const { data: reel, error: reelError } = await (admin as any).from("locapass_reels").select("id").eq("portal_id", row.portal_id).eq("embed_provider", "youtube").eq("embed_ref", row.youtube_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (reelError || !reel?.id) throw new Error(reelError?.message ?? "リールIDを取得できませんでした");
  const { error: updateError } = await (admin as any).from("locapass_youtube_ingestions").update({ reel_id: reel.id, match_status: "matched_existing", reviewed_at: new Date().toISOString(), reviewed_by: userId, error_message: null }).eq("id", row.id);
  if (updateError) throw new Error(`投稿結果の保存に失敗しました: ${updateError.message}`);
  return reel.id as string;
}


