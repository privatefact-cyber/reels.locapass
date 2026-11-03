"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Play, X } from "lucide-react";
import { embedSrc } from "@/lib/embed";
import { VIDEO_PROVIDER_LABEL, videoUrlFor, type VideoProvider } from "@/lib/video";

/**
 * 外部動画(YouTubeショート / TikTok / Instagramリール)をサイト内で再生する。
 * 最初はサムネイルと再生ボタンだけを出し(埋め込みのスクリプトが重いため)、タップしたときに初めて読み込む。
 * 時間の制限は無い。再生中も右上の×でサムネイルに戻せる(縦スワイプで次へ送るため)。
 * 元の投稿へのリンクは、埋め込みが開けない場合に備えた控えめなものだけにして、サイト内に留まってもらう。
 */
export function EmbedPlayer({
  provider,
  refId,
  title,
  posterUrl,
  active = true,
  className = "absolute inset-0",
}: {
  provider: VideoProvider;
  refId: string;
  title: string;
  posterUrl?: string | null;
  /** falseになったら(画面から外れたら)再生を止めてサムネイルへ戻す。 */
  active?: boolean;
  /** 配置(親の中で絶対配置する)。 */
  className?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const label = VIDEO_PROVIDER_LABEL[provider];

  useEffect(() => {
    if (!active) {
      setPlaying(false);
      setLoaded(false);
    }
  }, [active]);

  return (
    <div className={`${className} overflow-hidden bg-black`}>
      {playing ? (
        <>
          {!loaded && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-zinc-900">
              {posterUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={posterUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
              )}
              <span className="relative rounded-full bg-black/70 px-4 py-2 text-xs font-bold text-white">読み込み中…</span>
            </div>
          )}
          {/* 上の細い帯に「閉じる」と元の投稿へのリンクを置く(埋め込み側のボタンと重ならないように)。 */}
          <div className="absolute inset-x-0 top-0 z-20 flex h-8 items-center justify-between bg-black px-2">
            <a
              href={videoUrlFor(provider, refId)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-white/70"
            >
              表示されない場合は {label} で見る <ExternalLink size={10} />
            </a>
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setLoaded(false);
              }}
              aria-label="閉じる"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-white"
            >
              <X size={14} />
            </button>
          </div>
          <iframe
            src={embedSrc(provider, refId)}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            onLoad={() => setTimeout(() => setLoaded(true), provider === "youtube" ? 400 : 3000)}
            className="absolute inset-x-0 bottom-0 top-8 h-[calc(100%-2rem)] w-full border-0 bg-black"
          />
        </>
      ) : (
        <button type="button" onClick={() => setPlaying(true)} aria-label={`${title}(${label})を再生`} className="group absolute inset-0 block h-full w-full">
          {posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={posterUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <span className="block h-full w-full bg-gradient-to-br from-zinc-800 via-zinc-900 to-black" />
          )}
          <span className="absolute inset-0 bg-black/30 transition group-hover:bg-black/20" />
          <span className="absolute left-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-bold text-white">{label}</span>
          <span className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white shadow-lg">
            <Play size={28} className="ml-0.5 fill-white" />
          </span>
        </button>
      )}
    </div>
  );
}
