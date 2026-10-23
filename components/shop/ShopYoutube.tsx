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
// 中国語は、zh-Hans より zh-CN のほうが、実際に簡体字の字幕が出た(TEDの多言語動画で確認。zh-Hans では繁体字が出た)。
const YT_CAPTION_LANG: Record<string, string> = { ja: "ja", en: "en", zh: "zh-CN", ar: "ar" };

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

/** 字幕ボタン(動画に登録されている言語のうち、サイトの言語に対応するものだけを出す)。 */
const CAPTION_BUTTONS: { key: string; label: string; codes: string[] }[] = [
  { key: "ja", label: "日本語", codes: ["ja"] },
  { key: "en", label: "English", codes: ["en"] },
  { key: "zh-s", label: "中文(简体)", codes: ["zh-CN", "zh-Hans"] },
  { key: "zh-t", label: "中文(繁體)", codes: ["zh-TW", "zh-Hant", "zh-HK"] },
  { key: "ar", label: "العربية", codes: ["ar"] },
  { key: "ko", label: "한국어", codes: ["ko"] },
];
/** サイトの言語 → 最初に出す字幕のボタン(日本語は、字幕を出さない)。 */
const LOCALE_TO_CAPTION: Record<string, string> = { ja: "off", en: "en", zh: "zh-s", ar: "ar" };
const CAPTION_LABEL: Record<string, string> = { ja: "字幕", en: "Subtitles", zh: "字幕", ar: "الترجمة" };
const CAPTION_OFF: Record<string, string> = { ja: "オフ", en: "Off", zh: "关闭", ar: "إيقاف" };

/**
 * 店舗ページの「動画紹介」。最初はYouTubeのサムネイルだけを出し(ページを重くしない)、
 * タップしたらその場でプレーヤーに切り替える(ページ遷移しない・playsinlineでiPhoneでも全画面に飛ばさない)。
 *
 * - 再生が終わったら、プレーヤーを外してサムネイルに戻す(YouTubeが終了時に出す「関連動画」の一覧を見せない)。
 * - おすすめは同じチャンネルのものだけ(rel=0)、アノテーションは出さない(iv_load_policy=3)。クッキーを使わないドメイン(youtube-nocookie)で埋め込む。
 * - 一時停止中にYouTube側が出す案内は、YouTubeの仕様で消せない。
 * - IFrame APIが読み込めない環境(広告ブロッカー等)では、通常のiframe埋め込みに切り替える(終了時の処理・字幕ボタンは効かない)。
 * - 字幕: サイトの言語が日本語以外のときは、その言語の字幕を最初から出すようYouTubeに頼む(cc_load_policy / cc_lang_pref)。
 *   字幕のデータはYouTube側にあり(言語ごとにSRT/VTTを登録)、その言語の字幕が登録されていなければ出ない。
 * - 字幕ボタン: 動画の下に「字幕: 日本語 English 中文 العربية オフ」を出し、再生を止めずに言語を切り替えられる
 *   (YouTubeの再生部品の字幕の命令 loadModule / setOption('captions') を使う。公式に文書化された命令ではないので、
 *   使えない場合は、ボタンを出さず、YouTube標準の字幕メニュー(歯車)に任せる)。サイトの言語を変えたときも、字幕を合わせる。
 */
export function ShopYoutube({ videoId, title }: { videoId: string; title: string }) {
  const { locale } = useLocale();
  const [playing, setPlaying] = useState(false);
  const [fallback, setFallback] = useState(false);
  const hl = YT_HL[locale] ?? "ja";
  const captionParams = locale !== "ja" ? { cc_load_policy: 1, cc_lang_pref: YT_CAPTION_LANG[locale] ?? "en" } : {};
  const holder = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const captionsOn = useRef(false);
  // 字幕ボタン: key → 動画にある実際の言語コード / いま選ばれているボタン(強調は、こちらで選んだ言語をそのまま使う。
  // YouTubeに「いまの字幕」を問い合わせると、前に選ばれた言語などの古い値が返ることがあるため、問い合わせない)
  const [tracks, setTracks] = useState<Record<string, string>>({});
  const [active, setActive] = useState<string>("off");
  const tracksRef = useRef<Record<string, string>>({});

  const selectCaption = (key: string, map: Record<string, string> = tracksRef.current) => {
    const p = playerRef.current;
    if (!p) return;
    try {
      if (key === "off") {
        p.unloadModule?.("captions");
        captionsOn.current = false;
      } else if (map[key]) {
        p.loadModule?.("captions");
        p.setOption?.("captions", "track", { languageCode: map[key] });
        captionsOn.current = true;
      } else return;
      setActive(key);
    } catch {
      // 字幕の命令が使えない環境では、何もしない(YouTube標準の字幕メニューを使ってもらう)。
    }
  };

  useEffect(() => {
    if (!playing || fallback) return;
    let player: any = null;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let polls = 0;
    let initialApplied = false;

    // 動画にある字幕の言語を調べて、ボタンに反映する(読み込み直後は空のことがあるので、数秒間くりかえす)。
    const sync = () => {
      const p = playerRef.current;
      if (!p || cancelled) return;
      polls++;
      try {
        if (!initialApplied && polls === 1) p.loadModule?.("captions");
        const list = (p.getOption?.("captions", "tracklist") ?? []) as { languageCode?: string }[];
        if (list.length) {
          const codes = new Set(list.map((t) => t.languageCode));
          const map: Record<string, string> = {};
          for (const b of CAPTION_BUTTONS) {
            const code = b.codes.find((c) => codes.has(c));
            if (code) map[b.key] = code;
          }
          tracksRef.current = map;
          setTracks((prev) => (JSON.stringify(prev) === JSON.stringify(map) ? prev : map));
          if (!initialApplied) {
            initialApplied = true;
            const want = LOCALE_TO_CAPTION[localeRef.current] ?? "off";
            if (want === "off") {
              p.unloadModule?.("captions");
              captionsOn.current = false;
              setActive("off");
            } else if (map[want]) {
              // YouTubeは、見る人が前に選んだ字幕の言語を覚えていて、それが優先されることがある。最初は、サイトの言語を、はっきり指定する。
              p.setOption?.("captions", "track", { languageCode: map[want] });
              captionsOn.current = true;
              setActive(want);
            }
          }
        }
      } catch {
        // 字幕の命令が使えないときは、ボタンは出さない。
      }
      // 字幕の言語を調べ終わったら、問い合わせをやめる。数十秒たっても字幕が見つからない動画は、あきらめる(ボタンを出さない)。
      if ((initialApplied || polls > 40) && timer) {
        clearInterval(timer);
        timer = null;
      }
    };

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
            onReady: (e: any) => {
              playerRef.current = e.target;
              e.target.playVideo();
              timer = setInterval(sync, 1500);
            },
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
      if (timer) clearInterval(timer);
      playerRef.current = null;
      captionsOn.current = false;
      tracksRef.current = {};
      setTracks({});
      setActive("off");
      try {
        player?.destroy();
      } catch {
        // 破棄に失敗しても画面は戻せるので何もしない。
      }
      if (holder.current) holder.current.innerHTML = "";
    };
    // プレーヤーは、サイトの言語を変えても作り直さない(再生を止めない)。言語は localeRef で読む。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, fallback, videoId]);

  // 再生中にサイトの言語を変えたら、字幕もその言語に合わせる。
  const firstLocale = useRef(true);
  useEffect(() => {
    if (firstLocale.current) {
      firstLocale.current = false;
      return;
    }
    if (!playerRef.current || Object.keys(tracksRef.current).length === 0) return;
    const want = LOCALE_TO_CAPTION[locale] ?? "off";
    if (want === "off" || tracksRef.current[want]) selectCaption(want);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  const hasButtons = playing && !fallback && Object.keys(tracks).length > 0;

  return (
    <div>
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
      {hasButtons && (
        <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label={CAPTION_LABEL[locale] ?? "Subtitles"}>
          <span className="text-xs text-tone-400">{CAPTION_LABEL[locale] ?? "Subtitles"}:</span>
          {CAPTION_BUTTONS.filter((b) => tracks[b.key]).map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => selectCaption(b.key)}
              aria-pressed={active === b.key}
              className={`rounded-full border px-3 py-1 text-xs transition ${active === b.key ? "border-accent bg-accent font-semibold text-on-accent" : "border-tone-700 text-tone-300 hover:border-accent"}`}
            >
              {b.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => selectCaption("off")}
            aria-pressed={active === "off"}
            className={`rounded-full border px-3 py-1 text-xs transition ${active === "off" ? "border-accent bg-accent font-semibold text-on-accent" : "border-tone-700 text-tone-300 hover:border-accent"}`}
          >
            {CAPTION_OFF[locale] ?? "Off"}
          </button>
        </div>
      )}
    </div>
  );
}
