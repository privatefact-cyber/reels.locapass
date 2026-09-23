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
    if (!video || !src || !active) return;

    // 非アクティブ化・アンマウント時にiOS Safari(WebKit)がバックグラウンドで
    // Rangeリクエストのプリロードを続けるのを確実に止める。DOMからの除去
    // (Reactのアンマウント)だけでは止まらないことがあるための明示的な後始末。
    const stopLoading = () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    };

    if (!isHls) {
      void video.play().catch(() => undefined);
      return stopLoading;
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      void video.play().catch(() => undefined);
      return stopLoading;
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
    return () => {
      hls?.destroy();
      stopLoading();
    };
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
      webkit-playsinline="true"
      {...rest}
    />
  );
});
