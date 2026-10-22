"use client";

import { useState } from "react";
import { ExternalLink, Play } from "lucide-react";
import { ShopYoutube } from "@/components/shop/ShopYoutube";
import { VIDEO_PROVIDER_LABEL, videoUrlFor, type VideoProvider } from "@/lib/video";

/**
 * 店舗ページの「動画紹介」。YouTube は専用の部品(終了時にサムネイルへ戻す)。
 * TikTok / Instagram は、最初は店舗の写真(無ければ背景)と再生ボタンだけを出し(埋め込みのスクリプトが重いため)、
 * タップしたときに初めて埋め込みを読み込む。埋め込みが開けない場合に備え、元の投稿を開くリンクも添える。
 */
export function ShopVideo({
  provider,
  videoRef,
  title,
  posterUrl,
}: {
  provider: VideoProvider;
  videoRef: string;
  title: string;
  posterUrl?: string | null;
}) {
  const [playing, setPlaying] = useState(false);
  if (provider === "youtube") return <ShopYoutube videoId={videoRef} title={title} />;

  const label = VIDEO_PROVIDER_LABEL[provider];
  const originalUrl = videoUrlFor(provider, videoRef);
  // 縦長の動画(TikTok/Instagram)は、読み込み前後で高さが変わらないよう、固定の高さの枠にする。
  const frameClass = `mx-auto w-full ${provider === "tiktok" ? "max-w-[340px] h-[720px]" : "max-w-[420px] h-[700px]"}`;

  const src = provider === "tiktok" ? `https://www.tiktok.com/embed/v2/${videoRef}` : `https://www.instagram.com/${videoRef}/embed/`;

  return (
    <div className="space-y-1.5">
      <div className={`relative overflow-hidden rounded-xl bg-black ${frameClass}`}>
        {playing ? (
          <iframe
            src={src}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0 bg-white"
          />
        ) : (
          <button type="button" onClick={() => setPlaying(true)} aria-label={`${title}(${label})`} className="group absolute inset-0 block h-full w-full">
            {posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={posterUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
            ) : (
              <span className="block h-full w-full bg-gradient-to-br from-zinc-800 via-zinc-900 to-black" />
            )}
            <span className="absolute inset-0 bg-black/45 transition group-hover:bg-black/30" />
            <span className="absolute left-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-bold text-white">{label}</span>
            <span className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white shadow-lg">
              <Play size={26} className="ml-0.5 fill-white" />
            </span>
          </button>
        )}
      </div>
      <a href={originalUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1 text-[11px] text-tone-500 hover:text-accent">
        {playing ? `表示されない場合は ${label} で見る` : `${label}で見る`} <ExternalLink size={11} />
      </a>
    </div>
  );
}
