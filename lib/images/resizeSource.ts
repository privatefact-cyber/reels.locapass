import sharp from "sharp";

/** 縮小してよい元画像: このプロジェクトのSupabase Storageの公開URLだけ(他のURLを中継する踏み台にしない)。 */
function allowedPrefix(): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return base ? `${base.replace(/\/$/, "")}/storage/v1/object/public/` : null;
}

export function isAllowedSource(url: string): boolean {
  const prefix = allowedPrefix();
  return !!prefix && url.startsWith(prefix);
}

const MAX_SOURCE_BYTES = 30 * 1024 * 1024;

export type ResizeParams = {
  width: number;
  height?: number;
  fit: "cover" | "contain";
  quality: number;
  format: "webp" | "jpeg";
};

/** 元画像を取得して縮小する。取れない・大きすぎる・画像でないときはnull。 */
export async function resizeFromUrl(url: string, p: ResizeParams): Promise<{ data: Buffer; contentType: string } | null> {
  if (!isAllowedSource(url)) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_SOURCE_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_SOURCE_BYTES) return null;

    let img = sharp(buf, { failOn: "none", limitInputPixels: 120_000_000 })
      .rotate() // スマホ写真の向き情報を反映
      .resize({ width: p.width, height: p.height, fit: p.fit, withoutEnlargement: true, position: "centre" });
    img = p.format === "jpeg" ? img.jpeg({ quality: p.quality, mozjpeg: true }) : img.webp({ quality: p.quality });
    const data = await img.toBuffer();
    return { data, contentType: p.format === "jpeg" ? "image/jpeg" : "image/webp" };
  } catch {
    return null;
  }
}
