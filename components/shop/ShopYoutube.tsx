"use client";

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";

/* eslint-disable @typescript-eslint/no-explicit-any -- YouTube IFrame Player API は型定義を持ち込まず、使う分だけ any で扱う */
declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** サイトの言語 → YouTubeの画面・字幕の言語。 */
const YT_HL: Record<string, string> = { ja: "ja", en: "en", zh: "zh-CN", ar: "ar" };
const YT_CAPTION_LANG: Record<string, string> = { ja: "ja", en: "en", zh: "zh-Hans", ar: "ar" };

let apiPromise: Promise<any> | null = null;
/** YouTube IFrame Player API を一度だけ読み込む(タップされるまで読み込まない=ページを重くしない)。 */
function loadYouTubeApi(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => {
      apiPromise = null;
      reject(new Error("youtube api failed"));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

/**
 * 店舗ページの「動画紹介」。最初はYouTubeのサムネイルだけを出し(ページを重くしない)、
 * タップしたらその場でプレーヤーに切り替える(ページ遷移しない・playsinlineでiPhoneでも全画面に飛ばさない)。
 *
 * - 再生が終わったら、プレーヤーを外してサムネイルに戻す(YouTubeが終了時に出す「関連動画」の一覧を見せない)。
 * - おすすめは同じチャンネルのものだけ(rel=0)、アノテーションは出さない(iv_load_policy=3)。クッキーを使わないドメイン(youtube-nocookie)で埋め込む。
 * - 一時停止中にYouTube側が出す案内は、YouTubeの仕様で消せない。
 * - IFrame APIが読み込めない環境(広告ブロッカー等)では、通常のiframe埋め込みに切り替える(終了時の処理だけ効かない)。
 * - 字幕: サイトの言語が日本語以外のときは、その言語の字幕を最初から出すようYouTubeに頼む(cc_load_policy / cc_lang_pref)。
 *   字幕のデータはYouTube側にあり(言語ごとにSRT/VTTを登録)、その言語の字幕が登録されていなければ出ない。
 *   見る人は、再生中にプレーヤーの字幕ボタン(CC)から、ほかの言語にも切り替えられる。
 */
export function ShopYoutube({ videoId, title }: { videoId: string; title: string }) {
  const { locale } = useLocale();
  const [playing, setPlaying] = useState(false);
  const [fallback, setFallback] = useState(false);
  const hl = YT_HL[locale] ?? "ja";
  const captionParams = locale !== "ja" ? { cc_load_policy: 1, cc_lang_pref: YT_CAPTION_LANG[locale] ?? "en" } : {};
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!playing || fallback) return;
    let player: any = null;
    let cancelled = false;
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !holder.current) return;
        const el = document.createElement("div");
        holder.current.appendChild(el);
        player = new YT.Player(el, {
          host: "https://www.youtube-nocookie.com",
          videoId,
          width: "100%",
          height: "100%",
          playerVars: { autoplay: 1, playsinline: 1, rel: 0, iv_load_policy: 3, modestbranding: 1, hl, ...captionParams, origin: window.location.origin },
          events: {
            onReady: (e: any) => e.target.playVideo(),
            onStateChange: (e: any) => {
              if (e.data === YT.PlayerState.ENDED) setPlaying(false);
            },
            onError: () => setFallback(true),
          },
        });
      })
      .catch(() => {
        if (!cancelled) setFallback(true);
      });
    return () => {
      cancelled = true;
      try {
        player?.destroy();
      } catch {
        // 破棄に失敗しても画面は戻せるので何もしない。
      }
      if (holder.current) holder.current.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, fallback, videoId, hl, locale]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
      {playing ? (
        fallback ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0&iv_load_policy=3&hl=${hl}${locale !== "ja" ? `&cc_load_policy=1&cc_lang_pref=${captionParams.cc_lang_pref}` : ""}`}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : (
          <div ref={holder} className="absolute inset-0 [&_iframe]:absolute [&_iframe]:inset-0 [&_iframe]:h-full [&_iframe]:w-full [&_iframe]:border-0" />
        )
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
