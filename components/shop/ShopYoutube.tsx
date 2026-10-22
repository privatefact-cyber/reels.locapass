"use client";

import { useState } from "react";
import { Play } from "lucide-react";

/**
 * 店舗ページの「動画紹介」。最初はYouTubeのサムネイルだけを出し(ページを重くしない)、
 * タップしたらその場でプレーヤーに切り替える(ページ遷移しない・playsinlineでiPhoneでも全画面に飛ばさない)。
 * 同じチャンネルの動画だけをおすすめに出す(rel=0)。クッキーを使わないドメイン(youtube-nocookie)で埋め込む。
 */
export function ShopYoutube({ videoId, title }: { videoId: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      ) : (
        <button type="button" onClick={() => setPlaying(true)} aria-label={title} className="group absolute inset-0 block h-full w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          <span className="absolute inset-0 bg-black/25 transition group-hover:bg-black/10" />
          <span className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white shadow-lg">
            <Play size={26} className="ml-0.5 fill-white" />
          </span>
        </button>
      )}
    </div>
  );
}
