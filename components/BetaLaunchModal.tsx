"use client";

import { useEffect, useState } from "react";

// トップ画面の初期検索ゲート(ReelFeedのGateOverlay)と同じすりガラスカードの見た目を流用した、
// 公開ローンチ告知用のワンショットモーダル。合言葉ゲート解除にあわせて、初回訪問時にだけ出す。
const DISMISS_KEY = "locapass_beta_launch_dismissed";

export function BetaLaunchModal() {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY)) return;
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
        onClick={(e) => e.stopPropagation()}
        className={`relative flex w-[86vw] max-w-sm transform-gpu flex-col items-center gap-7 overflow-hidden rounded-[2.5rem] border border-main/25 bg-main/[0.04] px-8 py-12 text-center shadow-2xl shadow-black/40 backdrop-blur-2xl backdrop-saturate-150 transition-all duration-[250ms] ease-out will-change-transform ${
          closing ? "scale-90 opacity-0" : "scale-100 opacity-100"
        }`}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-main/10 via-transparent to-transparent"
        />

        <span className="relative rounded-full border border-main/25 bg-main/[0.03] px-4 py-1 text-[11px] font-medium tracking-[0.35em] text-main/70">
          BETA
        </span>

        <div className="relative flex flex-col gap-1.5 text-[15px] font-light leading-relaxed tracking-[0.2em] text-main/80">
          <span>街がつながる</span>
          <span>人が繋がる</span>
          <span>地域のパスポート</span>
        </div>

        <span className="relative text-3xl font-thin tracking-[0.35em] text-main uppercase">
          LOCAPASS
        </span>

        <p className="relative text-[11px] tracking-widest text-main/50">
          ベータ版 まもなくローンチ
        </p>

        <button
          type="button"
          onClick={close}
          className="relative mt-1 rounded-full border border-main/25 bg-main/[0.03] px-8 py-2 text-xs tracking-[0.2em] text-main/90 backdrop-blur-md transition hover:bg-main/10"
        >
          見る
        </button>
      </div>
    </div>
  );
}
