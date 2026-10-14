/**
 * 一覧のタイルやポスターに出す画像を、表示サイズに合わせた軽い版のURLにする。
 * 元画像(スマホ写真は3000px超・数MB)をそのまま小さく表示すると、通信量とデコードが重くなり、
 * 低価格のAndroidで特に遅くなるため。変換できないURLは、そのまま返す。
 */

const STORAGE_MARKER = "/storage/v1/object/public/";
const STREAM_THUMB = /\/thumbnails\/thumbnail\.jpg(?:[?#].*)?$/;

function placeholderThumb(url: string): string | null {
  // 仮の画像(/placeholders/<group>/<name>.jpg)は、scripts/make-image-thumbs.mjs が作る縮小版(webp)を使う。
  const m = url.match(/^(?:https:\/\/locapass\.net)?\/placeholders\/(.+)\.jpe?g$/i);
  return m ? `/placeholders-thumb/${m[1]}.webp` : null;
}

/** 正方形タイル(一覧のグリッド)用。 */
export function gridThumb(url: string | null | undefined, size = 360): string | undefined {
  if (!url) return undefined;
  const ph = placeholderThumb(url);
  if (ph) return ph;
  if (url.includes(STORAGE_MARKER)) {
    const u = new URL(url.replace(STORAGE_MARKER, "/storage/v1/render/image/public/"));
    u.searchParams.set("width", String(size));
    u.searchParams.set("height", String(size));
    u.searchParams.set("resize", "cover");
    u.searchParams.set("quality", "70");
    return u.toString();
  }
  if (STREAM_THUMB.test(url)) {
    const base = url.replace(/\?.*$/, "");
    return `${base}?width=${size}&height=${size}&fit=crop`;
  }
  return url;
}

/** 全画面のポスター(縦横比を保つ)用。 */
export function posterImage(url: string | null | undefined, width = 720): string | undefined {
  if (!url) return undefined;
  if (url.includes(STORAGE_MARKER)) {
    const u = new URL(url.replace(STORAGE_MARKER, "/storage/v1/render/image/public/"));
    u.searchParams.set("width", String(width));
    u.searchParams.set("height", String(width * 2.4));
    u.searchParams.set("resize", "contain");
    u.searchParams.set("quality", "75");
    return u.toString();
  }
  if (STREAM_THUMB.test(url)) {
    return `${url.replace(/\?.*$/, "")}?width=${width}`;
  }
  return url;
}
