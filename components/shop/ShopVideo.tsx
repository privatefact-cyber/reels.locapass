"use client";

import { ExternalLink, Play } from "lucide-react";
import { ShopYoutube } from "@/components/shop/ShopYoutube";
import { VIDEO_PROVIDER_LABEL, videoUrlFor, type VideoProvider } from "@/lib/video";

/**
 * 店舗ページの「動画紹介」。
 *  - YouTube: ページの中でその場再生(終了時にサムネイルへ戻す)。
 *  - TikTok / Instagram: ページの中では再生せず、「動画のリンクカード」にする。タップすると元の投稿が新しいタブで開く。
 *    埋め込みにすると、投稿者名・いいね数・「アプリで見る」などの表示が必ず付き、画面の大半が相手のサービスになって離脱しやすいため。
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
  if (provider === "youtube") return <ShopYoutube videoId={videoRef} title={title} />;

  const label = VIDEO_PROVIDER_LABEL[provider];
  return (
    <a
      href={videoUrlFor(provider, videoRef)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${title}(${label}で開く)`}
      className="group relative block aspect-video w-full overflow-hidden rounded-xl bg-black"
    >
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
      <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-8 text-xs font-bold text-white">
        {label}で見る <ExternalLink size={12} />
      </span>
    </a>
  );
}
