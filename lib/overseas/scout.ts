import { createAdminClient } from "@/lib/supabase/admin";
import { GEMINI_LITE_MODEL, geminiLiteGenerateContentUrl } from "@/lib/gemini";

/**
 * 海外の情報集め(個人用の下調べ)。YouTubeを検索して、日本語の要約つきで保存する。公開はしない(管理者だけが見る)。
 * いまは「セブ」だけ。地域が増えたら REGIONS に足す。
 */

export type ScoutQuery = { q: string; lang: "en" | "ja"; region?: "PH" };
export type ScoutRegion = { key: string; label: string; queries: ScoutQuery[] };

export const REGIONS: ScoutRegion[] = [
  {
    key: "cebu",
    label: "セブ(フィリピン)",
    queries: [
      { q: "Cebu cafe", lang: "en", region: "PH" },
      { q: "Cebu restaurant food", lang: "en", region: "PH" },
      { q: "Cebu coworking space", lang: "en", region: "PH" },
      { q: "Cebu condo tour", lang: "en", region: "PH" },
      { q: "Cebu cost of living", lang: "en", region: "PH" },
      { q: "Cebu IT Park Ayala", lang: "en", region: "PH" },
      { q: "セブ島 移住 生活", lang: "ja" },
      { q: "セブ島 カフェ", lang: "ja" },
      { q: "セブ島 グルメ", lang: "ja" },
      { q: "セブ島 コンドミニアム", lang: "ja" },
    ],
  },
];

export const CATEGORIES = ["カフェ", "レストラン・グルメ", "コワーキング・仕事", "住まい・コンドミニアム", "生活費・暮らし", "買い物・スーパー", "医療・クリニック", "英語学校", "観光・遊び", "交通・移動", "その他"] as const;

const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";
export const MAX_NEW_PER_RUN = 40;

function ytKey() {
  const key = process.env.YOUTUBE_DATA_API_KEY ?? process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_DATA_API_KEY または YOUTUBE_API_KEY が未設定です");
  return key;
}

async function ytJson<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${YOUTUBE_API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", ytKey());
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`YouTube API ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

function parseDuration(value?: string): number | null {
  const m = value?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export type Candidate = {
  youtubeId: string;
  title: string;
  description: string;
  channelTitle: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
  sourceQuery: string;
};

type SearchRes = { items?: { id?: { videoId?: string } }[] };
type VideosRes = { items?: { id: string; snippet?: { title?: string; description?: string; channelTitle?: string; publishedAt?: string }; contentDetails?: { duration?: string } }[] };

/** 1つの検索語で動画を探す。videoDuration: short=4分未満 / medium=4〜20分。公開から1年以内を関連度順で。 */
export async function searchCandidates(query: ScoutQuery, duration: "short" | "medium", maxResults = 25): Promise<Candidate[]> {
  const publishedAfter = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();
  const search = await ytJson<SearchRes>("search", {
    part: "id",
    q: query.q,
    type: "video",
    relevanceLanguage: query.lang,
    ...(query.region ? { regionCode: query.region } : {}),
    maxResults: String(maxResults),
    order: "relevance",
    videoDuration: duration,
    publishedAfter,
  });
  const ids = [...new Set((search.items ?? []).map((i) => i.id?.videoId).filter((id): id is string => !!id))];
  if (ids.length === 0) return [];
  const details = await ytJson<VideosRes>("videos", { part: "snippet,contentDetails", id: ids.join(","), maxResults: String(ids.length) });
  return (details.items ?? [])
    .filter((v) => v.snippet?.title)
    .map((v) => ({
      youtubeId: v.id,
      title: (v.snippet?.title ?? "").slice(0, 300),
      description: (v.snippet?.description ?? "").slice(0, 1500),
      channelTitle: v.snippet?.channelTitle ?? null,
      publishedAt: v.snippet?.publishedAt ?? null,
      durationSeconds: parseDuration(v.contentDetails?.duration),
      sourceQuery: query.q,
    }));
}

export type Summary = { id: string; relevant: boolean; title_ja: string; summary_ja: string; place_name: string; area: string; category: string };

/** 動画の題名・説明を、日本語の要約にする(まとめて1回)。書かれていないことは作らない。 */
export async function summarizeBatch(region: ScoutRegion, batch: Candidate[]): Promise<Map<string, Summary>> {
  const apiKey = process.env.GEMINI_API_KEY;
  const out = new Map<string, Summary>();
  if (!apiKey || batch.length === 0) return out;
  const items = batch.map((c) => ({ id: c.youtubeId, title: c.title, channel: c.channelTitle, description: c.description.slice(0, 700) }));
  const prompt = `あなたは、${region.label}への移住を考えている日本人のための、下調べの助手です。
次のYouTube動画の「題名・説明」だけを根拠に、日本語で整理してください。書かれていないこと(値段・場所・営業時間など)は、作らずに空にします。
各動画について、次のJSONの配列を返します(入力と同じ順で、同じid)。
{"id":"入力のid","relevant":true|false,"title_ja":"日本語の題名","summary_ja":"何についての動画か、場所・値段・コツなど書かれている事実を、日本語で2〜3文","place_name":"店・施設の名前(分かれば。無ければ空)","area":"エリア・地区(分かれば。無ければ空)","category":"${CATEGORIES.join(" / ")} のどれか1つ"}
relevant は、${region.label}で暮らす・遊ぶ・働く人に役立つ情報なら true。広告だけ・無関係・内容が分からないものは false。

入力:
${JSON.stringify(items)}`;
  const res = await fetch(geminiLiteGenerateContentUrl(apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, responseMimeType: "application/json" } }),
    signal: AbortSignal.timeout(60_000),
  }).catch(() => null);
  if (!res || !res.ok) {
    console.error(`overseas-scout: ${GEMINI_LITE_MODEL} failed`, res?.status);
    return out;
  }
  try {
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const arr = JSON.parse(raw.replace(/```json\s*|```/g, "")) as Partial<Summary>[];
    for (const s of arr) {
      if (!s?.id) continue;
      out.set(String(s.id), {
        id: String(s.id),
        relevant: s.relevant !== false,
        title_ja: String(s.title_ja ?? "").slice(0, 200),
        summary_ja: String(s.summary_ja ?? "").slice(0, 600),
        place_name: String(s.place_name ?? "").slice(0, 120),
        area: String(s.area ?? "").slice(0, 80),
        category: (CATEGORIES as readonly string[]).includes(String(s.category)) ? String(s.category) : "その他",
      });
    }
  } catch {
    console.error("overseas-scout: could not parse summaries");
  }
  return out;
}

export type CollectResult = { queries: number; found: number; added: number; summarized: number; errors: string[] };

/** 検索 → 既に保存済みを除く → 日本語に要約 → 保存。1回の追加は MAX_NEW_PER_RUN 本まで。 */
export async function collectRegion(regionKey: string, duration: "short" | "medium", queryLimit = 10): Promise<CollectResult> {
  const region = REGIONS.find((r) => r.key === regionKey);
  if (!region) throw new Error("不明な地域です");
  const admin = createAdminClient() as any;
  const errors: string[] = [];
  const found = new Map<string, Candidate>();
  const queries = region.queries.slice(0, queryLimit);
  for (const query of queries) {
    try {
      for (const c of await searchCandidates(query, duration)) if (!found.has(c.youtubeId)) found.set(c.youtubeId, c);
    } catch (e) {
      errors.push(`${query.q}: ${e instanceof Error ? e.message : "失敗"}`);
    }
  }
  const ids = [...found.keys()];
  const known = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await admin.from("locapass_overseas_notes").select("youtube_id").eq("region", region.key).in("youtube_id", ids.slice(i, i + 100));
    for (const r of data ?? []) known.add(r.youtube_id as string);
  }
  const fresh = [...found.values()].filter((c) => !known.has(c.youtubeId)).slice(0, MAX_NEW_PER_RUN);
  let summarized = 0;
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < fresh.length; i += 8) {
    const batch = fresh.slice(i, i + 8);
    const sums = await summarizeBatch(region, batch);
    for (const c of batch) {
      const s = sums.get(c.youtubeId);
      if (s) summarized++;
      rows.push({
        region: region.key, youtube_id: c.youtubeId, title: c.title, description: c.description || null, channel_title: c.channelTitle,
        published_at: c.publishedAt, duration_seconds: c.durationSeconds, source_query: c.sourceQuery,
        title_ja: s?.title_ja || null, summary_ja: s?.summary_ja || null, place_name: s?.place_name || null, area: s?.area || null,
        category: s?.category ?? null, relevant: s ? s.relevant : true,
      });
    }
  }
  if (rows.length) {
    const { error } = await admin.from("locapass_overseas_notes").upsert(rows, { onConflict: "region,youtube_id", ignoreDuplicates: true });
    if (error) throw new Error(`保存に失敗しました: ${error.message}`);
  }
  return { queries: queries.length, found: found.size, added: rows.length, summarized, errors };
}
