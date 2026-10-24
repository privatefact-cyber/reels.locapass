"use client";

import { useEffect, useRef, useState } from "react";

/** この秒数だけ流して止める(通信量と電池を使い続けないため)。止まったあとはサムネイルが残る。 */
const PLAY_SECONDS = 45;

/**
 * 店舗ヒーローの背景に YouTube を無音で自動再生する(写真が無い店舗や、店舗が選んだとき用)。
 * - 再生が始まるまでは YouTube のサムネイルを敷く(黒い画面を見せない)。再生が始まったら映像に切り替える。
 * - 枠(300px / sm:380px)いっぱいに16:9を中央で切り抜く。操作は受けない(pointer-events-none)。
 *   音と全画面の再生は、下の「動画紹介」で行う。
 * - PLAY_SECONDS 秒たったら一時停止して映像を外し、サムネイルだけにする。
 */
export function HeroYoutubeBackground({ videoId, title }: { videoId: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [stopped, setStopped] = useState(false);

  // originを渡すにはブラウザ側でしか分からないので、表示後にURLを作る。
  useEffect(() => {
    const id = encodeURIComponent(videoId);
    setSrc(
      `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}` +
        `&controls=0&disablekb=1&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3&fs=0` +
        `&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`,
    );
  }, [videoId]);

  // 再生が始まったら知らせてもらい、PLAY_SECONDS 後に止める。
  useEffect(() => {
    if (!src) return;
    let timer: number | undefined;
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || typeof e.data !== "string") return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.event === "infoDelivery" && msg.info?.playerState === 1 && !timer) {
          setPlaying(true);
          timer = window.setTimeout(() => {
            frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "pauseVideo", args: [] }), "*");
            setStopped(true);
          }, PLAY_SECONDS * 1000);
        }
      } catch {
        // YouTube以外のメッセージは無視
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (timer) window.clearTimeout(timer);
    };
  }, [src]);

  const showVideo = playing && !stopped;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-black" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`} alt="" className="absolute inset-0 h-full w-full object-cover" />
      {src && !stopped && (
        <iframe
          ref={frame}
          src={src}
          title={title}
          tabIndex={-1}
          referrerPolicy="strict-origin-when-cross-origin"
          allow="autoplay; encrypted-media"
          onLoad={() => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1 }), "*")}
          className={`absolute left-1/2 top-1/2 aspect-video w-[max(100%,534px)] -translate-x-1/2 -translate-y-1/2 border-0 transition-opacity duration-700 sm:w-[max(100%,676px)] ${showVideo ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </div>
  );
}
