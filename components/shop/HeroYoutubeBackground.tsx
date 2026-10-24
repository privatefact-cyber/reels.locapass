/**
 * 店舗ヒーローの背景に YouTube を無音・自動ループで敷く(写真が無い店舗用)。
 * 枠(300px / sm:380px)いっぱいに16:9を中央で切り抜いて広げる。操作は受けず(pointer-events-none)、
 * 音声と全画面の再生は下の「動画紹介」で行う。
 */
export function HeroYoutubeBackground({ videoId, title }: { videoId: string; title: string }) {
  const src =
    `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}` +
    `?autoplay=1&mute=1&loop=1&playlist=${encodeURIComponent(videoId)}` +
    `&controls=0&disablekb=1&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3&fs=0`;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-black" aria-hidden="true">
      <iframe
        src={src}
        title={title}
        tabIndex={-1}
        loading="lazy"
        allow="autoplay; encrypted-media"
        className="absolute left-1/2 top-1/2 aspect-video w-[max(100%,534px)] -translate-x-1/2 -translate-y-1/2 border-0 sm:w-[max(100%,676px)]"
      />
    </div>
  );
}
