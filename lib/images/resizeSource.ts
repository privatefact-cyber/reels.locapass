import sharp from "sharp";

/**
 * 縮小してよい元画像。Supabase Storageに加えて、YouTubeの公式サムネイル
 * ホストだけを許可する。任意URLを中継するとSSRF用の踏み台になるため、
 * ホスト名は固定のallowlistにする。
 */
function allowedPrefix(): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return base ? `${base.replace(/\/$/, "")}/storage/v1/object/public/` : null;
}

export function isAllowedSource(url: string): boolean {
  const prefix = allowedPrefix();
  if (prefix && url.startsWith(prefix)) return true;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "i.ytimg.com" || host === "img.youtube.com";
  } catch {
    return false;
  }
}

function isYouTubeThumbnail(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "i.ytimg.com" || host === "img.youtube.com";
  } catch {
    return false;
  }
}

const MAX_SOURCE_BYTES = 30 * 1024 * 1024;

export type ResizeParams = {
  width: number;
  height?: number;
  fit: "cover" | "contain";
  quality: number;
  format: "webp" | "jpeg";
};

/** 元画像を取得する。取れない・大きすぎるときはnull。 */
async function fetchImage(url: string): Promise<Buffer | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_SOURCE_BYTES) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.byteLength > MAX_SOURCE_BYTES ? null : buf;
}

/** YouTubeサムネイルURLから、ショート動画用の縦長サムネイル(oardefault.jpg, 1080×1920)のURLを作る。 */
function youtubeVerticalThumb(url: string): string | null {
  const m = url.match(/^https:\/\/(?:i\.ytimg\.com|img\.youtube\.com)\/vi\/([A-Za-z0-9_-]{6,})\//);
  return m ? `https://i.ytimg.com/vi/${m[1]}/oardefault.jpg` : null;
}

/**
 * 一覧の正方形タイル用に、YouTubeショートのサムネイルから「縦の映像だけ」を取り出す。
 * hqdefault(480×360)は、中央の縦の映像(高さの9:16の幅)の左右を、同じ映像のぼかしで埋めた画像になっている。
 * ぼかしは黒ではないので trim では消えない。そこで、
 *  1. ショート用の縦長サムネイル(oardefault)があればそれを使う(高画質で左右の帯なし)
 *  2. 無ければ hqdefault の上下の黒帯を除いてから、中央の9:16の帯だけを切り出す
 */
async function youtubeShortsSource(url: string): Promise<sharp.Sharp | null> {
  const vertical = youtubeVerticalThumb(url);
  if (vertical) {
    const buf = await fetchImage(vertical).catch(() => null);
    if (buf) return sharp(buf, { failOn: "none" });
  }
  const buf = await fetchImage(url);
  if (!buf) return null;
  const trimmed = await sharp(buf, { failOn: "none" })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 1 }, threshold: 18 })
    .toBuffer({ resolveWithObject: true })
    .catch(() => null);
  const data = trimmed?.data ?? buf;
  const { width = 0, height = 0 } = trimmed?.info ?? (await sharp(buf).metadata());
  const strip = Math.round((height * 9) / 16);
  if (!width || !height || strip >= width) return sharp(data, { failOn: "none" });
  return sharp(data, { failOn: "none" }).extract({ left: Math.round((width - strip) / 2), top: 0, width: strip, height });
}

/** 元画像を取得して縮小する。取れない・大きすぎる・画像でないときはnull。 */
export async function resizeFromUrl(url: string, p: ResizeParams): Promise<{ data: Buffer; contentType: string } | null> {
  if (!isAllowedSource(url)) return null;
  try {
    const squareTile = isYouTubeThumbnail(url) && p.fit === "cover" && p.height === p.width;
    let img: sharp.Sharp;
    if (squareTile) {
      const src = await youtubeShortsSource(url);
      if (!src) return null;
      // extract の後に resize を続けるため、一度バッファにしてから縮小する。
      img = sharp(await src.toBuffer(), { failOn: "none" });
    } else {
      const buf = await fetchImage(url);
      if (!buf) return null;
      img = sharp(buf, { failOn: "none", limitInputPixels: 120_000_000 }).rotate();
    }
    img = img.resize({ width: p.width, height: p.height, fit: p.fit === "contain" ? "inside" : "cover", withoutEnlargement: !squareTile, position: "centre" });
    img = p.format === "jpeg" ? img.jpeg({ quality: p.quality, mozjpeg: true }) : img.webp({ quality: p.quality });
    const data = await img.toBuffer();
    return { data, contentType: p.format === "jpeg" ? "image/jpeg" : "image/webp" };
  } catch {
    return null;
  }
}
