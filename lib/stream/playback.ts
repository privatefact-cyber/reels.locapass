/** Cloudflare Stream のHLSマニフェストURLを作る。値が未設定なら移行中の既存URLを使う。 */
export function streamPlaybackUrl(uid: string) {
  const customerCode = process.env.NEXT_PUBLIC_CF_STREAM_CUSTOMER_CODE;
  if (!customerCode) return null;
  return `https://customer-${customerCode}.cloudflarestream.com/${uid}/manifest/video.m3u8`;
}

/** streamPlaybackUrlが返すマニフェストURLから、同じ動画のサムネイル画像URLを作る。 */
export function streamThumbnailFromManifestUrl(manifestUrl: string) {
  return manifestUrl.replace(/\/manifest\/video\.m3u8(?:[?#].*)?$/, "/thumbnails/thumbnail.jpg");
}
