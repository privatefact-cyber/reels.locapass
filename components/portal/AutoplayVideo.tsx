"use client";

import { useEffect, useRef } from "react";

/** iPhone Safari向けに、属性設定だけでなく再生APIも明示的に呼ぶヒーロー動画。 */
export function AutoplayVideo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);

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
    start();
    return () => {
      video.removeEventListener("loadedmetadata", start);
      video.removeEventListener("canplay", start);
    };
  }, [src]);

  return (
    <video
      ref={ref}
      src={src}
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
