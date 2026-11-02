import { R2_PUBLIC_BASE_URL } from "@/lib/storage/r2";

/** 1つのZIPに入れる投稿の数。大きすぎるとZIPが4GBを超えたり、関数の実行時間に収まらないので、分けてダウンロードしてもらう。 */
export const REELS_PER_ZIP = 30;

/** 一括・個別ダウンロードで取りに行ってよいURL(自前のR2 と 自前のSupabase Storage)。ブラウザから届いたURLは使わず、DBの値だけを対象にする。 */
export function isDownloadableUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return url.startsWith(`${R2_PUBLIC_BASE_URL}/`) || (!!supabase && url.startsWith(`${supabase}/storage/`));
}

type ReelFiles = { video_url: string | null; images: unknown };

/** リール1件にあるダウンロード対象のファイル(動画、または複数枚の写真)。HLS(.m3u8)などは対象外。 */
export function reelFileUrls(reel: ReelFiles): string[] {
  if (reel.video_url) return isDownloadableUrl(reel.video_url) && !/\.m3u8(\?|$)/i.test(reel.video_url) ? [reel.video_url] : [];
  const images = Array.isArray(reel.images) ? (reel.images as { url?: string }[]) : [];
  return images.map((i) => i.url).filter(isDownloadableUrl);
}

export function extensionOf(url: string): string {
  return (url.split("?")[0].match(/\.([a-z0-9]{2,4})$/i)?.[1] ?? "bin").toLowerCase();
}
