/**
 * locapass_reels の動画/画像列(video_url・images・poster_url)を、LUXELA本家 reels.media と同じ
 * [{ type, url }] の配列に変換する。本家から移植した画面はこの形を前提にしているため、共通で使う。
 */
export type LocapassReelMediaColumns = {
  video_url: string | null;
  images: unknown;
  poster_url: string | null;
};

export type ReelMediaItem = { type: "video" | "image"; url: string };

export function toReelMedia(row: LocapassReelMediaColumns): ReelMediaItem[] {
  const images = (row.images as { url: string }[] | null) ?? [];
  if (row.video_url) return [{ type: "video", url: row.video_url }];
  if (images.length > 0) return images.map((img) => ({ type: "image" as const, url: img.url }));
  return row.poster_url ? [{ type: "image", url: row.poster_url }] : [];
}

/** 本家 reels 相当の列名で locapass_reels を選ぶための select 断片(media は toReelMedia で組み立てる)。 */
export const LOCAPASS_REEL_MEDIA_SELECT = "video_url, images, poster_url";
