import { streamThumbnailFromManifestUrl } from "@/lib/stream/playback";

/**
 * 動画を「サムネイル表示専用(再生しない)」で出す小さな要素。
 * Cloudflare Stream(.m3u8)はsrc直指定で先頭フレームを描画できないため、
 * Streamのサムネイル画像エンドポイントをimgで表示する。レガシーな直URL動画(mp4等)は
 * 従来通りvideoタグで先頭フレームを描画させる。
 */
export function StreamThumb({
  url,
  className,
  muted = true,
}: {
  url: string;
  className?: string;
  muted?: boolean;
}) {
  if (url.includes(".m3u8")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={streamThumbnailFromManifestUrl(url)} alt="" className={className} />;
  }
  // モバイルSafari等は#t=0.001を付けないと先頭フレームへシークせず真っ黒のままになることがある。
  // eslint-disable-next-line jsx-a11y/media-has-caption
  return (
    <video
      src={`${url}#t=0.001`}
      className={className}
      muted={muted}
      playsInline
      preload="metadata"
    />
  );
}
