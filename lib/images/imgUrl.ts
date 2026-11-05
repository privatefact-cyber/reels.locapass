/**
 * Supabase Storageの画像を縮小して配信するための自前API(/api/img)のURLを作る。
 * Supabaseの画像変換(render/image)は「縮小した元画像1000枚ごとに$5」と枚数に比例して課金されるため、
 * 縮小は自前のAPIで行い、結果をCDNに長く保存する(同じURLは2回目以降は作り直さない)。
 * ブラウザでもサーバーでも使えるように、sharpは読み込まない(縮小の本体は lib/images/resizeSource.ts)。
 */

export const STORAGE_MARKER = "/storage/v1/object/public/";

export type ImgOptions = {
  width: number;
  height?: number;
  /** cover=指定の枠いっぱいに切り抜く / contain=縦横比を保って枠に収める。 */
  fit?: "cover" | "contain";
  quality?: number;
  /** 省略時はwebp(軽い)。共有などで他のアプリに渡す画像はjpegにする。 */
  format?: "webp" | "jpeg";
};

/** YouTubeの公式サムネイル(縮小APIが取りに行ってよいホスト。lib/images/resizeSource.ts と揃える)。 */
export function isYouTubeThumbUrl(url: string): boolean {
  return /^https:\/\/(?:i\.ytimg\.com|img\.youtube\.com)\//.test(url);
}

/**
 * SupabaseのStorageの公開URLなら、縮小APIのURLを返す。それ以外はnull。
 * allowYouTube を付けたときだけ、YouTubeのサムネイルも縮小APIに通す(一覧の正方形タイルで、ショートの左右のぼかしを切り落とすため)。
 */
export function resizedUrl(url: string, opt: ImgOptions, { allowYouTube = false }: { allowYouTube?: boolean } = {}): string | null {
  if (!url.includes(STORAGE_MARKER) && !(allowYouTube && isYouTubeThumbUrl(url))) return null;
  const p = new URLSearchParams();
  p.set("u", url.replace(/\?.*$/, ""));
  p.set("w", String(Math.round(opt.width)));
  if (opt.height) p.set("h", String(Math.round(opt.height)));
  p.set("fit", opt.fit ?? "cover");
  p.set("q", String(opt.quality ?? 70));
  if (opt.format === "jpeg") p.set("f", "jpeg");
  return `/api/img?${p.toString()}`;
}
