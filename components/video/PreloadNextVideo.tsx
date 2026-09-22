"use client";

import { useEffect, useRef } from "react";

type HlsInstance = { destroy: () => void; loadSource: (src: string) => void; attachMedia: (media: HTMLMediaElement) => void };

/**
 * リール一覧で「次に表示される動画」の先頭2〜3秒ぶんのセグメントだけをバックグラウンドで
 * 先読みし、実際にアクティブになったときの再生開始までの待ち時間を減らす。
 * 画面には一切表示しない、再生もしない隠しvideo要素(HTTP/CDNキャッシュを温めるだけ)。
 */
export function PreloadNextVideo({ src }: { src?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src || !src.includes(".m3u8")) return;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.load();
      return;
    }

    let hls: HlsInstance | undefined;
    let cancelled = false;
    void import("hls.js")
      .then(({ default: Hls }) => {
        if (cancelled || !Hls.isSupported() || !videoRef.current) return;
        // maxBufferLengthを2〜3秒相当に絞り、それ以上のセグメントは取りに行かない。
        hls = new Hls({ maxBufferLength: 3, maxMaxBufferLength: 3, backBufferLength: 0 });
        hls.loadSource(src);
        hls.attachMedia(video);
      })
      .catch((cause) => console.error("[stream-preload] hls initialization failed", cause));

    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      muted
      playsInline
      preload="none"
      aria-hidden
      className="pointer-events-none absolute h-0 w-0 opacity-0"
    />
  );
}
