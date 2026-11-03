"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Play, Volume2, VolumeX, X } from "lucide-react";
import { embedSrc } from "@/lib/embed";
import { VIDEO_PROVIDER_LABEL, videoUrlFor, type VideoProvider } from "@/lib/video";

const PRECONNECT_HOSTS: Record<VideoProvider, string[]> = {
  youtube: ["https://www.youtube.com", "https://i.ytimg.com"],
  tiktok: ["https://www.tiktok.com"],
  instagram: ["https://www.instagram.com", "https://static.cdninstagram.com"],
};

/**
 * 外部動画(YouTubeショート / TikTok / Instagramリール)をサイト内で再生する。
 * 時間の制限は無い。再生中も上の帯の×でサムネイルに戻せる(縦スワイプで次へ送るため)。
 * 元の投稿へのリンクは、埋め込みが開けない場合に備えた控えめなものだけにして、サイト内に留まってもらう。
 *
 * 読み込みが遅い(Instagramは数秒〜10秒ほど)ため、画面に出た時点で接続だけ先に済ませ、
 * Instagramはタップを待たずに見えない状態で先に読み込んでおく(再生ボタンを押した時には読み込み済みになる)。
 * YouTube/TikTokは、画面に出ているカードだけ無音で自動再生する(見られていないカードでは読み込まない)。
 */
export function EmbedPlayer({
  provider,
  refId,
  title,
  posterUrl,
  active = true,
  preload = false,
  autoStart = false,
  className = "absolute inset-0",
}: {
  provider: VideoProvider;
  refId: string;
  title: string;
  posterUrl?: string | null;
  /** falseになったら(画面から外れたら)再生を止めてサムネイルへ戻す。 */
  active?: boolean;
  /** 画面に出る直前(次/前のカード)。Instagramは、スワイプで着いたときに待たないよう、ここから先読みを始める。 */
  preload?: boolean;
  /** YouTube/TikTokを、画面に出たら無音で自動再生する(フィードのカード用)。音は再生画面の音量ボタンで出す。 */
  autoStart?: boolean;
  /** 配置(親の中で絶対配置する)。 */
  className?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // 閉じるを押したら、そのカードでは自動再生を再開しない(画面から外れるまで)。
  const [dismissed, setDismissed] = useState(false);
  const autoPlay = autoStart && (provider === "youtube" || provider === "tiktok");
  const label = VIDEO_PROVIDER_LABEL[provider];
  const frame = useRef<HTMLIFrameElement>(null);
  // 自動再生は無音で始まる。埋め込み側の音量ボタンは再生中に隠れることがあるため、こちらにも音のボタンを置く。
  const [soundOn, setSoundOn] = useState(false);

  function toggleSound() {
    const next = !soundOn;
    const w = frame.current?.contentWindow;
    if (!w) return;
    if (provider === "tiktok") {
      w.postMessage({ "x-tiktok-player": true, type: next ? "unMute" : "mute", value: undefined }, "*");
    } else if (provider === "youtube") {
      w.postMessage(JSON.stringify({ event: "command", func: next ? "unMute" : "mute", args: [] }), "*");
      if (next) w.postMessage(JSON.stringify({ event: "command", func: "setVolume", args: [100] }), "*");
    }
    setSoundOn(next);
  }
  // タップ前から読み込んでおくのはInstagramだけ(再生ボタンを押しても自動では鳴らない)。
  const warm = (active || preload) && provider === "instagram";
  const mounted = playing || warm;

  useEffect(() => {
    if (!active) {
      setPlaying(false);
      setSoundOn(false);
      setDismissed(false);
    } else if (autoPlay && !dismissed) {
      setPlaying(true);
    }
    if (!active && !preload) setLoaded(false);
  }, [active, preload, autoPlay, dismissed]);

  // TikTokは、URLの自動再生指定だけでは始まらないことがある(ブラウザの設定など)ため、
  // 再生が始まるまで「無音にして再生」の指示をプレーヤーへ繰り返し送る(再生位置が進み始めたら止める)。
  useEffect(() => {
    if (!(playing && autoPlay && provider === "tiktok")) return;
    let started = false;
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const d = e.data as { "x-tiktok-player"?: boolean; type?: string; value?: { currentTime?: number } } | null;
      if (d?.["x-tiktok-player"] && d.type === "onCurrentTime" && (d.value?.currentTime ?? 0) > 0.2) started = true;
    };
    window.addEventListener("message", onMessage);
    const send = (type: string) => frame.current?.contentWindow?.postMessage({ "x-tiktok-player": true, type, value: undefined }, "*");
    let tries = 0;
    const timer = window.setInterval(() => {
      if (started || ++tries > 12) return window.clearInterval(timer);
      send("mute");
      send("play");
    }, 700);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("message", onMessage);
    };
  }, [playing, autoPlay, provider]);

  // 画面に出たら、埋め込み先への接続だけ先に済ませておく。
  useEffect(() => {
    if (!active && !preload) return;
    const links = PRECONNECT_HOSTS[provider].map((href) => {
      const link = document.createElement("link");
      link.rel = "preconnect";
      link.href = href;
      link.crossOrigin = "anonymous";
      document.head.appendChild(link);
      return link;
    });
    return () => links.forEach((l) => l.remove());
  }, [active, preload, provider]);

  return (
    <div className={`${className} overflow-hidden bg-black`}>
      {/* 同じiframeを出し入れしないよう、読み込み中も再生中も同じ要素のまま、見た目だけ切り替える(切り替えで読み込み直しにならない)。 */}
      {mounted && (
        <iframe
          ref={frame}
          src={embedSrc(provider, refId, true, autoPlay)}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          tabIndex={playing ? 0 : -1}
          aria-hidden={!playing}
          onLoad={() => setTimeout(() => setLoaded(true), provider === "youtube" ? 400 : 3000)}
          className={
            playing
              ? "absolute inset-x-0 bottom-0 top-8 h-[calc(100%-2rem)] w-full border-0 bg-black"
              : "pointer-events-none absolute inset-0 h-full w-full border-0 opacity-0"
          }
        />
      )}
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
              {label}で見る <ExternalLink size={10} />
            </a>
            {autoPlay && (
              <button
                type="button"
                onClick={toggleSound}
                aria-label={soundOn ? "音を消す" : "音を出す"}
                className="ml-auto mr-2 flex h-6 items-center gap-1 rounded-full bg-white/20 px-2 text-[11px] font-semibold text-white"
              >
                {soundOn ? <Volume2 size={13} /> : <VolumeX size={13} />}
                {soundOn ? "音あり" : "音を出す"}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setSoundOn(false);
                setDismissed(true);
                // 先読みしているInstagramは、閉じても読み込み済みのまま残す(また開いたとき待たない)。
                if (!warm) setLoaded(false);
              }}
              aria-label="閉じる"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-white"
            >
              <X size={14} />
            </button>
          </div>
        </>
      ) : (
        <button type="button" onClick={() => setPlaying(true)} aria-label={`${title}(${label})を再生`} className="group absolute inset-0 z-10 block h-full w-full">
          {posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={posterUrl} alt="" decoding="async" className="h-full w-full object-cover" />
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
