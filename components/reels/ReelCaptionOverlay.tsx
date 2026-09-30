"use client";

import { useEffect, useState, type RefObject } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { useReelCaptionsPreference } from "@/lib/reels/useReelCaptionsPreference";

type Cue = { s: number; e: number; t: string };
type Zone = "none" | "top" | "middle" | "bottom";
type CaptionData = { cues: Cue[]; zone: Zone };

/** 字幕は ja / en / zh の3言語。アラビア語など他の言語の人には英語を出す。 */
function captionLang(locale: string): "ja" | "en" | "zh" {
  if (locale === "ja" || locale === "zh") return locale;
  return "en";
}

const CC_LABEL: Record<string, string> = { ja: "字幕", zh: "字幕", en: "Captions", ar: "Captions" };

// 同じリールを何度も取りに行かない(スワイプで戻ったとき等)。取得失敗はキャッシュしない。
const cache = new Map<string, CaptionData>();

/**
 * 動画の上に重ねる多言語テロップ。
 * - 見る人の言語(サイトの言語設定)に合わせた字幕を出す。日本語の人には元の台詞、英語・中国語の人には翻訳。
 * - 動画に字幕が焼き込まれている場合(zone)は、その位置を避けて反対側に出す。
 *   日本語表示のときは、焼き込み字幕と内容が重複するので出さない。
 * - 右上のCCボタンで消せる(端末に記憶)。字幕が無いリールでは何も出さない。
 */
export function ReelCaptionOverlay({
  reelId,
  videoRef,
  active,
}: {
  reelId: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  active: boolean;
}) {
  const { locale } = useLocale();
  const lang = captionLang(locale);
  const [on, setOn] = useReelCaptionsPreference();
  const [data, setData] = useState<CaptionData | null>(null);
  const [text, setText] = useState<string | null>(null);

  // 再生中の1本だけ字幕を取りに行く。
  useEffect(() => {
    if (!active) return;
    const key = `${reelId}:${lang}`;
    const hit = cache.get(key);
    if (hit) {
      setData(hit);
      return;
    }
    let cancelled = false;
    fetch(`/api/reels/${reelId}/captions?lang=${lang}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { cues?: Cue[]; zone?: Zone } | null) => {
        if (cancelled || !json) return;
        const value: CaptionData = { cues: Array.isArray(json.cues) ? json.cues : [], zone: json.zone ?? "none" };
        cache.set(key, value);
        setData(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [reelId, lang, active]);

  const cues = data?.cues ?? [];
  const zone = data?.zone ?? "none";
  // 日本語表示で焼き込み字幕がある動画は、テロップが二重になるので出さない。
  const suppressed = lang === "ja" && zone !== "none";
  const visible = active && on && !suppressed && cues.length > 0;

  // 再生位置に合わせて台詞を切り替える(動画のループでも currentTime が巻き戻るので追従する)。
  useEffect(() => {
    if (!visible) {
      setText(null);
      return;
    }
    let raf = 0;
    let last = -2;
    const tick = () => {
      const video = videoRef.current;
      if (video) {
        const time = video.currentTime;
        let index = -1;
        for (let i = 0; i < cues.length; i++) {
          if (time >= cues[i].s && time <= cues[i].e + 0.15) {
            index = i;
            break;
          }
        }
        if (index !== last) {
          last = index;
          setText(index >= 0 ? cues[index].t : null);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, cues, videoRef]);

  if (!active || suppressed || cues.length === 0) return null;

  // 焼き込み字幕が下・中段なら上に、上なら下に出す。無ければ下(投稿者名/CTAの少し上)。
  const atTop = zone === "bottom" || zone === "middle";

  return (
    <>
      {visible && text && (
        <div
          className={`pointer-events-none absolute left-3 right-16 z-10 flex justify-center ${
            atTop ? "top-16" : "bottom-36"
          }`}
        >
          <p className="max-w-full rounded-lg bg-black/65 px-3 py-1.5 text-center text-[15px] font-semibold leading-snug text-white shadow-lg [text-wrap:balance]">
            {text}
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOn(!on)}
        aria-label={CC_LABEL[locale] ?? CC_LABEL.en}
        aria-pressed={on}
        className={`pointer-events-auto absolute right-3 top-14 z-10 flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold tracking-tight backdrop-blur-sm ${
          on ? "bg-white text-black" : "bg-black/50 text-main"
        }`}
      >
        CC
      </button>
    </>
  );
}
