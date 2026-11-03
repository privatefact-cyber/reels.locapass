import type { VideoProvider } from "@/lib/video";

/** サイト内再生用の埋め込みURL。識別子だけを保存しているので、ここで組み立てる(lib/video.ts の ref と同じ形式)。 */
export function embedSrc(provider: VideoProvider, ref: string, autoplay = true, muted = false): string {
  switch (provider) {
    case "youtube":
      // 終わったら頭に戻して繰り返す(ショート向け)。関連動画は同じチャンネルのものだけにする。
      return `https://www.youtube.com/embed/${ref}?playsinline=1&rel=0&loop=1&playlist=${ref}${autoplay ? "&autoplay=1" : ""}${muted ? "&mute=1&controls=0&modestbranding=1&fs=0&iv_load_policy=3&disablekb=1" : ""}&enablejsapi=1${typeof window !== "undefined" ? `&origin=${encodeURIComponent(window.location.origin)}` : ""}`;
    case "tiktok":
      // TikTok現行の埋め込みプレーヤー(oEmbedが返す形式)。自動再生・無音・ループを指定できる。
      return `https://www.tiktok.com/player/v1/${ref}?loop=1&music_info=1&description=1${autoplay ? "&autoplay=1" : ""}${muted ? "&muted=1" : ""}`;
    case "instagram":
      return `https://www.instagram.com/${ref}/embed/`;
  }
}

/** 一覧のサムネイルに使える画像。YouTubeだけは、識別子から直接作れる(TikTok/Instagramは保存時に取得・アップロードした画像を使う)。 */
export function youtubeThumbUrl(ref: string): string {
  return `https://i.ytimg.com/vi/${ref}/hqdefault.jpg`;
}

export type EmbedRef = { provider: VideoProvider; ref: string };

export function toEmbedRef(provider: string | null | undefined, ref: string | null | undefined): EmbedRef | null {
  if (!provider || !ref) return null;
  return provider === "youtube" || provider === "tiktok" || provider === "instagram" ? { provider, ref } : null;
}
