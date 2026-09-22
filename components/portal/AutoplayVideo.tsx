"use client";

import { useEffect, useRef } from "react";

type HlsInstance = { destroy: () => void; loadSource: (src: string) => void; attachMedia: (media: HTMLMediaElement) => void };

/**
 * iPhone Safari向けに、属性設定だけでなく再生APIも明示的に呼ぶヒーロー動画。
 * Cloudflare Streamの.m3u8を受け取った場合は、SafariはネイティブHLS、それ以外は
 * hls.jsでアタッチする(通常のmp4等はブラウザのsrc直指定でそのまま再生する)。
 */
export function AutoplayVideo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const isHls = src.includes(".m3u8");

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("webkit-playsinline", "true");

    const start = () => {
      void video.play().catch(() => {
        // iOSの低電力モード等で自動再生が禁止される場合はSafariの仕様に従う。
      });
    };

    video.addEventListener("loadedmetadata", start);
    video.addEventListener("canplay", start);

    let hls: HlsInstance | undefined;
    if (isHls && !video.canPlayType("application/vnd.apple.mpegurl")) {
      void import("hls.js")
        .then(({ default: Hls }) => {
          if (!Hls.isSupported() || !ref.current) return;
          hls = new Hls({ maxBufferLength: 8, backBufferLength: 0 });
          hls.loadSource(src);
          hls.attachMedia(video);
          start();
        })
        .catch((cause) => console.error("[stream-playback] hls initialization failed", cause));
    } else {
      video.src = src;
      start();
    }

    return () => {
      video.removeEventListener("loadedmetadata", start);
      video.removeEventListener("canplay", start);
      hls?.destroy();
    };
  }, [src, isHls]);

  return (
    <video
      ref={ref}
      autoPlay
      muted
      playsInline
      loop
      preload="auto"
      disablePictureInPicture
      controlsList="nodownload noplaybackrate noremoteplayback"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full object-cover"
    />
  );
}
