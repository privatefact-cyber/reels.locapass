import { streamThumbnailFromManifestUrl } from "@/lib/stream/playback";
import type { ReelMediaItem } from "@/lib/reels/locapassReelMedia";

/** 動画ストックのタイルに使うサムネ。写真はそのURL、動画はposter → ストリームのサムネ → (無ければ)動画の先頭フレームの順。 */
export function archiveThumbFromMedia(media: ReelMediaItem): { thumbUrl: string | null; videoUrl: string | null } {
  if (media.type === "image") return { thumbUrl: media.url, videoUrl: null };
  if (media.poster) return { thumbUrl: media.poster, videoUrl: null };
  if (media.url.includes(".m3u8")) return { thumbUrl: streamThumbnailFromManifestUrl(media.url), videoUrl: null };
  return { thumbUrl: null, videoUrl: media.url };
}
