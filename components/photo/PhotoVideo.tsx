"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 縦ビューアの動画。リールと同じように、画面に6割以上映ったら無音で自動再生し、外れたら止める(ループ)。
 * 音は、プレーヤー標準のコントロールで出せる。
 *
 * 低価格の端末・通信量への配慮: 動画のURLは、画面の1.5画面分まで近づいたカードにだけ設定し、
 * 遠く離れたら外す(一覧に動画が何本あっても、近くの1〜2本だけ読み込む)。
 * 自動再生は無音(muted)+playsInlineであれば、iPhone/Androidとも許可される。
 */
export function PhotoVideo({ src, poster, label }: { src: string; poster: string; label: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [near, setNear] = useState(false);

  // 近くに来たらsrcを付け、離れたら外す。
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => setNear(entries.some((e) => e.isIntersecting)), {
      rootMargin: "150% 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // 6割以上映ったら再生、外れたら停止。
  useEffect(() => {
    const el = ref.current;
    if (!el || !near) return;
    // iPhoneの自動再生には、muted を属性とプロパティの両方で付けておく必要がある。
    el.muted = true;
    el.setAttribute("muted", "");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.6) {
            void el.play().catch(() => undefined);
          } else {
            el.pause();
          }
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      el.pause();
    };
  }, [near]);

  return (
    <video
      ref={ref}
      data-photo-video
      src={near ? src : undefined}
      poster={poster}
      controls
      muted
      loop
      playsInline
      preload={near ? "metadata" : "none"}
      aria-label={label}
      onPlay={(e) => {
        // 念のため、同時に再生するのは1本だけにする。
        document.querySelectorAll<HTMLVideoElement>("video[data-photo-video]").forEach((v) => {
          if (v !== e.currentTarget) v.pause();
        });
      }}
      className="w-full bg-black md:mx-auto md:max-h-[80dvh] md:w-auto"
    />
  );
}
