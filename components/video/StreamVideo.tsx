"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type VideoHTMLAttributes,
} from "react";
import type HlsInstance from "hls.js";

export interface StreamVideoProps extends VideoHTMLAttributes<HTMLVideoElement> {
  src?: string;
  active?: boolean;
}

export const StreamVideo = forwardRef<HTMLVideoElement, StreamVideoProps>(function StreamVideo(
  { src, active = true, muted = true, ...rest },
  forwardedRef,
) {
  const localRef = useRef<HTMLVideoElement>(null);
  useImperativeHandle(forwardedRef, () => localRef.current as HTMLVideoElement);
  const isHls = !!src && src.includes(".m3u8");

  useEffect(() => {
    const video = localRef.current;
    if (!video || !src || !active || !isHls) return;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      void video.play().catch(() => undefined);
      return;
    }

    let hls: HlsInstance | undefined;
    void import("hls.js")
      .then(({ default: Hls }) => {
        if (!Hls.isSupported() || !localRef.current) return;
        hls = new Hls({ maxBufferLength: 8, backBufferLength: 0 });
        hls.loadSource(src);
        hls.attachMedia(video);
        void video.play().catch(() => undefined);
      })
      .catch((cause) => console.error("[stream-playback] hls initialization failed", cause));

    return () => hls?.destroy();
  }, [src, active, isHls]);

  useEffect(() => {
    const video = localRef.current;
    if (!video) return;

    if (muted) {
      video.muted = true;
      video.volume = 0;
    } else {
      video.muted = false;
      video.volume = 1;
      if (active && video.paused) {
        void video.play().catch(() => undefined);
      }
    }
  }, [active, muted]);

  return (
    <video
      ref={localRef}
      src={isHls ? undefined : src}
      muted={muted}
      playsInline
      // @ts-expect-error WebKit specific attribute
      webkit-playsinline="true"
      {...rest}
    />
  );
});
