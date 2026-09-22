"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, type VideoHTMLAttributes } from "react";

type HlsInstance = {
  destroy: () => void;
  loadSource: (src: string) => void;
  attachMedia: (media: HTMLMediaElement) => void;
};

export type StreamVideoProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, "src"> & {
  src?: string;
  /** false の間は再生・HLSアタッチを行わない(フィード内の非アクティブカード等)。省略時true。 */
  active?: boolean;
};

/**
 * Cloudflare Stream の .m3u8 を再生できる<video>。SafariはネイティブHLS、それ以外は
 * hls.jsを使う(動的importで、m3u8を再生しないページにバンドルを持ち込まない)。
 * .m3u8でないsrc(アップロード前のローカルblob、静止画のfallback等)はそのまま素通しする。
 * iOSではmuted属性の切り替えだけで再生が止まることがあるため、明示的に反映して再開する。
 */
export const StreamVideo = forwardRef<HTMLVideoElement, StreamVideoProps>(function StreamVideo(
  { src, active = true, muted, ...rest },
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
    video.muted = muted ?? false;
    if (active && video.paused) void video.play().catch(() => undefined);
  }, [active, muted]);

  return <video ref={localRef} src={isHls ? undefined : src} muted={muted} {...rest} />;
});
