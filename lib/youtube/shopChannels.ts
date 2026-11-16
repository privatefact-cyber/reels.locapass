import { createAdminClient } from "@/lib/supabase/admin";
import { createEmbedPostForShop } from "@/lib/embed-post/createEmbedPost";
import { cleanAutoCaption } from "@/lib/reels/seoCaption";

/**
 * 店舗オプション「動画の自動追加」のうち、店が登録した YouTube チャンネルの新着動画を取り込む仕組み。
 *  - 登録: URL(@ハンドル・/channel/UC…)からチャンネルを特定して保存する。
 *  - 巡回: チャンネルの「アップロード一覧」(playlistItems)を新しい順に読み、まだ取り込んでいないShorts(3分以内・埋め込み可)を、その店のリールとして公開する。
 * YouTube Data API の消費は、1チャンネルあたり1回の巡回で2ポイント前後(検索の約1/50)。検索の枠を圧迫しない。
 * 取り込み済み・見送った動画は台帳(locapass_shop_channel_videos)に残し、店が削除した動画を二度と取り込まない。
 * 本数の上限は設けない(オプション契約の店は無制限)。ただし登録直後の最初の取り込みだけ、一度に入れる本数を絞る(FIRST_SYNC_MAX)。
 */

const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";
/** 登録直後の最初の取り込み。新しい順にこの本数まで(古い動画で新着が埋まらないよう、リールの日付は動画の公開日にする)。 */
export const FIRST_SYNC_MAX = 100;
/** 2回目以降の巡回で、1チャンネルあたり1回に見る新着の数。 */
const REGULAR_SYNC_LOOKBACK = 50;
const MAX_SHORT_SECONDS = 180;

function apiKey() {
  const key = process.env.YOUTUBE_DATA_API_KEY ?? process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_DATA_API_KEY または YOUTUBE_API_KEY が未設定です");
  return key;
}

async function yt<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${YOUTUBE_API}/${path}`);
  url.searchParams.set("key", apiKey());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`YouTube API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

export type ChannelInfo = { channelId: string; title: string | null; thumbUrl: string | null; uploadsPlaylistId: string };

/** 貼られたURL・文字から、チャンネルの指定方法を取り出す。/c/名前 など、APIで引けない形式は null。 */
export function parseChannelInput(raw: string): { by: "id" | "forHandle" | "forUsername"; value: string } | null {
  const text = raw.trim();
  if (!text) return null;
  if (/^UC[\w-]{20,}$/.test(text)) return { by: "id", value: text };
  if (/^@[\w.\-%]+$/.test(text)) return { by: "forHandle", value: text };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (!/(^|\.)youtube\.com$/i.test(url.hostname)) return null;
  const parts = url.pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p));
  if (parts[0]?.startsWith("@")) return { by: "forHandle", value: parts[0] };
  if (parts[0] === "channel" && parts[1]) return { by: "id", value: parts[1] };
  if (parts[0] === "user" && parts[1]) return { by: "forUsername", value: parts[1] };
  return null;
}

type ChannelsResponse = {
  items?: { id: string; snippet?: { title?: string; thumbnails?: { default?: { url?: string }; medium?: { url?: string } } }; contentDetails?: { relatedPlaylists?: { uploads?: string } } }[];
};

/** チャンネルを特定する(YouTube Data API 1ポイント)。見つからなければ null。 */
export async function resolveChannel(raw: string): Promise<ChannelInfo | null> {
  const parsed = parseChannelInput(raw);
  if (!parsed) return null;
  const data = await yt<ChannelsResponse>("channels", { part: "snippet,contentDetails", [parsed.by]: parsed.value, maxResults: "1" });
  const item = data.items?.[0];
  const uploads = item?.contentDetails?.relatedPlaylists?.uploads;
  if (!item || !uploads) return null;
  return {
    channelId: item.id,
    title: item.snippet?.title ?? null,
    thumbUrl: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? null,
    uploadsPlaylistId: uploads,
  };
}

function parseDuration(value?: string): number | null {
  const m = value?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

type PlaylistResponse = { items?: { contentDetails?: { videoId?: string } }[]; nextPageToken?: string };
type VideosResponse = {
  items?: { id: string; snippet?: { title?: string; publishedAt?: string }; contentDetails?: { duration?: string }; status?: { embeddable?: boolean; privacyStatus?: string } }[];
};

export type ChannelRow = { id: string; shop_id: string; channel_id: string; uploads_playlist_id: string; imported_count: number; last_checked_at: string | null };

/**
 * 1チャンネルを巡回して、新しいShortsを店のリールとして公開する。
 * 呼び出し側が、店の「動画の自動追加」契約の確認を済ませてから呼ぶ。
 */
export async function syncShopChannel(row: ChannelRow): Promise<{ imported: number; skipped: number; error: string | null }> {
  const admin = createAdminClient() as any;
  const first = row.last_checked_at === null && row.imported_count === 0;
  const want = first ? FIRST_SYNC_MAX : REGULAR_SYNC_LOOKBACK;
  try {
    // アップロード一覧を新しい順に読み、want本まで集める。
    const ids: string[] = [];
    let pageToken: string | undefined;
    while (ids.length < want) {
      const page = await yt<PlaylistResponse>("playlistItems", {
        part: "contentDetails", playlistId: row.uploads_playlist_id, maxResults: "50", ...(pageToken ? { pageToken } : {}),
      });
      for (const it of page.items ?? []) if (it.contentDetails?.videoId) ids.push(it.contentDetails.videoId);
      if (!page.nextPageToken) break;
      pageToken = page.nextPageToken;
    }
    const candidateIds = [...new Set(ids)].slice(0, want);
    if (candidateIds.length === 0) {
      await admin.from("locapass_shop_youtube_channels").update({ last_checked_at: new Date().toISOString(), last_error: null }).eq("id", row.id);
      return { imported: 0, skipped: 0, error: null };
    }
    // すでに台帳にある動画(取り込み済み・見送り済み・店が削除した分)は触らない。
    const { data: known } = await admin.from("locapass_shop_channel_videos").select("youtube_id").eq("shop_id", row.shop_id).in("youtube_id", candidateIds);
    const knownIds = new Set((known ?? []).map((r: { youtube_id: string }) => r.youtube_id));
    const fresh = candidateIds.filter((id) => !knownIds.has(id));
    let imported = 0;
    let skipped = 0;
    // 取り込みは古い順に行い、リールの新しい順がチャンネルの新しい順と同じになるようにする。
    for (let i = 0; i < fresh.length; i += 50) {
      const chunk = fresh.slice(i, i + 50);
      const details = await yt<VideosResponse>("videos", { part: "snippet,contentDetails,status", id: chunk.join(","), maxResults: String(chunk.length) });
      const byId = new Map((details.items ?? []).map((v) => [v.id, v]));
      for (const id of [...chunk].reverse()) {
        const video = byId.get(id);
        const seconds = parseDuration(video?.contentDetails?.duration);
        if (!video || video.status?.embeddable !== true || video.status?.privacyStatus !== "public" || seconds === null || seconds > MAX_SHORT_SECONDS) {
          await admin.from("locapass_shop_channel_videos").upsert({ shop_id: row.shop_id, youtube_id: id, channel_row_id: row.id, outcome: "skipped", note: !video ? "取得できず" : "Shorts以外・埋め込み不可・非公開" }, { onConflict: "shop_id,youtube_id", ignoreDuplicates: true });
          skipped += 1;
          continue;
        }
        // 1本の失敗で巡回全体が止まらないよう、動画ごとに囲む。失敗した動画は見送りとして台帳に残す(同じ動画で毎回つまずかない)。
        try {
          const form = new FormData();
          form.set("kind", "reel");
          form.set("video_url", `https://www.youtube.com/shorts/${id}`);
          form.set("text", (cleanAutoCaption(video.snippet?.title ?? "") ?? "").slice(0, 500));
          await createEmbedPostForShop(admin, row.shop_id, form);
          const { data: reel } = await admin.from("locapass_reels").select("id").eq("shop_id", row.shop_id).eq("embed_provider", "youtube").eq("embed_ref", id).order("published_at", { ascending: false }).limit(1).maybeSingle();
          // 登録直後にまとめて入れる過去の動画は、動画の公開日をリールの日付にする(新着が一度に埋まらないように)。
          const publishedAt = video.snippet?.publishedAt;
          if (reel?.id && publishedAt && Date.now() - new Date(publishedAt).getTime() > 2 * 24 * 3600 * 1000) {
            await admin.from("locapass_reels").update({ published_at: publishedAt }).eq("id", reel.id);
          }
          await admin.from("locapass_shop_channel_videos").upsert({ shop_id: row.shop_id, youtube_id: id, channel_row_id: row.id, reel_id: reel?.id ?? null, outcome: "imported" }, { onConflict: "shop_id,youtube_id", ignoreDuplicates: true });
          imported += 1;
        } catch (e) {
          await admin.from("locapass_shop_channel_videos").upsert({ shop_id: row.shop_id, youtube_id: id, channel_row_id: row.id, outcome: "skipped", note: (e instanceof Error ? e.message : "取り込み失敗").slice(0, 200) }, { onConflict: "shop_id,youtube_id", ignoreDuplicates: true });
          skipped += 1;
        }
      }
    }
    await admin.from("locapass_shop_youtube_channels").update({
      last_checked_at: new Date().toISOString(), last_error: null,
      ...(imported > 0 ? { last_imported_at: new Date().toISOString(), imported_count: row.imported_count + imported } : {}),
    }).eq("id", row.id);
    return { imported, skipped, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 300) : "取り込みに失敗しました";
    await admin.from("locapass_shop_youtube_channels").update({ last_checked_at: new Date().toISOString(), last_error: message }).eq("id", row.id);
    return { imported: 0, skipped: 0, error: message };
  }
}

/** 定期実行: 巡回の時間が来た、契約中の店のチャンネルを順に巡回する(1回の上限つき)。 */
export async function runShopChannelSync(options: { maxChannels?: number; minHours?: number; budgetMs?: number } = {}) {
  const admin = createAdminClient() as any;
  const started = Date.now();
  const budgetMs = options.budgetMs ?? 200_000;
  const threshold = new Date(Date.now() - (options.minHours ?? 5) * 3600 * 1000).toISOString();
  const { data: rows } = await admin
    .from("locapass_shop_youtube_channels")
    .select("id, shop_id, channel_id, uploads_playlist_id, imported_count, last_checked_at")
    .eq("status", "active")
    .or(`last_checked_at.is.null,last_checked_at.lt.${threshold}`)
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit((options.maxChannels ?? 40) * 3);
  const channels = (rows ?? []) as ChannelRow[];
  if (channels.length === 0) return { checked: 0, imported: 0, skipped: 0, errors: 0 };
  // 契約(動画の自動追加)中で、公開中の店だけ。
  const { data: shops } = await admin.from("locapass_shops").select("id").in("id", [...new Set(channels.map((c) => c.shop_id))]).eq("auto_video_enabled", true).eq("status", "active");
  const allowed = new Set((shops ?? []).map((s: { id: string }) => s.id));
  const summary = { checked: 0, imported: 0, skipped: 0, errors: 0 };
  for (const channel of channels) {
    if (summary.checked >= (options.maxChannels ?? 40) || Date.now() - started > budgetMs) break;
    if (!allowed.has(channel.shop_id)) continue;
    const result = await syncShopChannel(channel);
    summary.checked += 1;
    summary.imported += result.imported;
    summary.skipped += result.skipped;
    if (result.error) summary.errors += 1;
  }
  return summary;
}
