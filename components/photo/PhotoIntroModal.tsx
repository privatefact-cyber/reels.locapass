"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";

// トップのBetaLaunchModalと同じすりガラスカードの見た目。フォト(穴場情報)の入口で、セッションに1回だけ出す。
const DISMISS_KEY = "locapass_photo_intro_dismissed";

export function PhotoIntroModal() {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    // ?intro=1 を付けると、閉じたあとでも必ず出す(見た目の確認用)。
    const force = new URLSearchParams(window.location.search).get("intro") === "1";
    try {
      if (!force && sessionStorage.getItem(DISMISS_KEY)) return;
    } catch {}
    setOpen(true);
  }, []);

  function close() {
    setClosing(true);
    window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
      try {
        sessionStorage.setItem(DISMISS_KEY, "1");
      } catch {}
    }, 250);
  }

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity duration-[250ms] will-change-[opacity] ${
        closing ? "opacity-0" : "opacity-100"
      }`}
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={`relative flex w-[86vw] max-w-sm transform-gpu flex-col items-center gap-7 overflow-hidden rounded-[2.5rem] border border-main/25 bg-main/[0.04] px-8 py-12 text-center shadow-2xl shadow-black/40 backdrop-blur-2xl backdrop-saturate-150 transition-all duration-[250ms] ease-out will-change-transform ${
          closing ? "scale-90 opacity-0" : "scale-100 opacity-100"
        }`}
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-main/10 via-transparent to-transparent" />

        <span className="relative rounded-full border border-main/25 bg-main/[0.03] px-4 py-1 text-[11px] font-medium tracking-[0.35em] text-main/70">
          PHOTO
        </span>

        <p className="relative text-xl font-light leading-relaxed tracking-[0.12em] text-main">{t.photo.introLead}</p>

        <p className="relative text-[13px] font-light leading-loose tracking-[0.08em] text-main/75">{t.photo.introBody}</p>

        <button
          type="button"
          onClick={close}
          className="relative mt-1 rounded-full border border-main/25 bg-main/[0.03] px-8 py-2 text-xs tracking-[0.2em] text-main/90 backdrop-blur-md transition hover:bg-main/10"
        >
          {t.photo.introButton}
        </button>
      </div>
    </div>
  );
}
