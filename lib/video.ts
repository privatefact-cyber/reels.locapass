/**
 * 店舗ページの「動画紹介」に貼れる動画の判別。YouTube / TikTok / Instagram のURLから、
 * (サイト, 動画の識別子) を取り出す。識別子だけを保存し、URLは保存しない。
 *  - youtube  : 11文字のID
 *  - tiktok   : 数字のID(ブラウザのアドレスバーの `…/@ユーザー/video/数字` のURL。短縮URL(vm.tiktok.com)は不可)
 *  - instagram: `reel/コード` / `p/コード` / `tv/コード`(公開アカウントの投稿・リール)
 */
export type VideoProvider = "youtube" | "tiktok" | "instagram";
export type VideoRef = { provider: VideoProvider; ref: string };

export const VIDEO_PROVIDER_LABEL: Record<VideoProvider, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
};

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

export function parseVideoUrl(input: string): VideoRef | null {
  const raw = input.trim();
  if (!raw) return null;
  if (YT_ID.test(raw)) return { provider: "youtube", ref: raw }; // 11文字のIDそのもの
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\.|^m\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") {
    const id = parts[0];
    return id && YT_ID.test(id) ? { provider: "youtube", ref: id } : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    let id: string | null = null;
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else if (["shorts", "embed", "live", "v"].includes(parts[0] ?? "")) id = parts[1] ?? null;
    return id && YT_ID.test(id) ? { provider: "youtube", ref: id } : null;
  }
  if (host === "tiktok.com") {
    // /@user/video/1234567890123456789
    const i = parts.indexOf("video");
    const id = i >= 0 ? parts[i + 1] : parts[0] === "embed" && parts[1] === "v2" ? parts[2] : undefined;
    return id && /^\d{8,25}$/.test(id) ? { provider: "tiktok", ref: id } : null;
  }
  if (host === "instagram.com") {
    // /reel/CODE/ , /p/CODE/ , /tv/CODE/ , /ユーザー/reel/CODE/ , /ユーザー/p/CODE/
    const i = parts.findIndex((p) => p === "reel" || p === "reels" || p === "p" || p === "tv");
    const kind = i >= 0 ? (parts[i] === "reels" ? "reel" : parts[i]) : null;
    const code = i >= 0 ? parts[i + 1] : null;
    return kind && code && /^[A-Za-z0-9_-]{5,20}$/.test(code) ? { provider: "instagram", ref: `${kind}/${code}` } : null;
  }
  return null;
}

/** 保存済みの (サイト, 識別子) から、管理画面の入力欄に戻すためのURL。 */
export function videoUrlFor(provider: VideoProvider | null | undefined, ref: string | null | undefined): string {
  if (!provider || !ref) return "";
  switch (provider) {
    case "youtube":
      return `https://www.youtube.com/watch?v=${ref}`;
    case "tiktok":
      return `https://www.tiktok.com/video/${ref}`;
    case "instagram":
      return `https://www.instagram.com/${ref}/`;
  }
}

/** 古い列(youtube_video_id)だけが入っているデータも、同じ形で扱う。 */
export function resolveStoredVideo(row: { video_provider?: string | null; video_ref?: string | null; youtube_video_id?: string | null } | null | undefined): VideoRef | null {
  if (!row) return null;
  if (row.video_provider && row.video_ref && ["youtube", "tiktok", "instagram"].includes(row.video_provider)) {
    return { provider: row.video_provider as VideoProvider, ref: row.video_ref };
  }
  if (row.youtube_video_id) return { provider: "youtube", ref: row.youtube_video_id };
  return null;
}
