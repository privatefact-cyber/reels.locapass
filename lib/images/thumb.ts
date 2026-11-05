/**
 * 一覧のタイルやポスターに出す画像を、表示サイズに合わせた軽い版のURLにする。
 * 元画像(スマホ写真は3000px超・数MB)をそのまま小さく表示すると、通信量とデコードが重くなり、
 * 低価格のAndroidで特に遅くなるため。変換できないURLは、そのまま返す。
 */

import { resizedUrl } from "@/lib/images/imgUrl";

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
  // Supabase画像とYouTube公式サムネイルはサーバー側で正方形cropする。
  // YouTube画像に含まれる左右の黒帯もここで切り落とせる。
  const resized = resizedUrl(url, { width: size, height: size, fit: "cover", quality: 70 });
  // /api/img は長期 immutable cache のため、crop仕様を変更した際は
  // バージョンをURLに含めて古い画像を再利用しないようにする。
  if (resized) return `${resized}&v=square-crop-4`;
  if (STREAM_THUMB.test(url)) {
    const base = url.replace(/\?.*$/, "");
    return `${base}?width=${size}&height=${size}&fit=crop`;
  }
  return url;
}

/**
 * 正方形タイルのうち、投稿者が「見せる位置」を指定したもの用。
 * gridThumb はサーバー側で中央を切り抜くので位置を変えられない。ここでは縦横比を保ったまま
 * 取得して、画面側(CSSの object-position)で正方形に切り抜く。
 * 横長の写真でも短い辺がタイルの幅(size)以上になるよう、取得する幅は size の2倍にしている。
 */
export function focusThumb(url: string | null | undefined, size = 360): string | undefined {
  if (!url) return undefined;
  const width = size * 2;
  // 仮の画像(/placeholders/...)は、正方形に縮小済みの版しか無いので、位置の指定は使えない。元の画像をそのまま返す。
  if (placeholderThumb(url)) return url;
  const resized = resizedUrl(url, { width, fit: "contain", quality: 70 });
  if (resized) return resized;
  if (STREAM_THUMB.test(url)) {
    return `${url.replace(/\?.*$/, "")}?width=${width}`;
  }
  return url;
}

/** 全画面のポスター(縦横比を保つ)用。 */
export function posterImage(url: string | null | undefined, width = 1200): string | undefined {
  if (!url) return undefined;
  const resized = resizedUrl(url, { width, height: width * 2.4, fit: "contain", quality: 82 });
  if (resized) return resized;
  if (STREAM_THUMB.test(url)) {
    return `${url.replace(/\?.*$/, "")}?width=${width}`;
  }
  return url;
}
