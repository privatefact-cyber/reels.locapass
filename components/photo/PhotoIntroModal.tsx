"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";

// トップのBetaLaunchModalと同じすりガラスカードの見た目。フォト(穴場情報)のページを開くたびに毎回出す。

export function PhotoIntroModal() {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  // ページを開くたびに(再読み込み・他のページから戻ったときも)毎回出す。
  useEffect(() => {
    setOpen(true);
  }, []);

  function close() {
    setClosing(true);
    window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
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
        className={`relative flex w-[88vw] max-w-md transform-gpu flex-col items-center gap-6 overflow-hidden rounded-[2.5rem] border border-main/25 bg-main/[0.04] px-7 py-10 text-center shadow-2xl shadow-black/40 backdrop-blur-2xl backdrop-saturate-150 transition-all duration-[250ms] ease-out will-change-transform sm:px-10 sm:py-12 ${
          closing ? "scale-90 opacity-0" : "scale-100 opacity-100"
        }`}
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-main/10 via-transparent to-transparent" />

        <span className="relative rounded-full border border-main/25 bg-main/[0.03] px-4 py-1 text-[11px] font-medium tracking-[0.35em] text-main/70">
          LOCA SNAP
        </span>

        <p className="relative whitespace-pre-line text-balance text-lg font-light leading-[1.8] tracking-[0.08em] text-main sm:text-xl">
          {t.photo.introLead}
        </p>

        <p className="relative max-w-sm whitespace-pre-line text-balance text-[13px] font-light leading-[2] tracking-[0.04em] text-main/75 sm:text-sm">
          {t.photo.introBody}
        </p>

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
