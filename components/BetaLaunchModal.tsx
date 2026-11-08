"use client";

import { useEffect, useState } from "react";

// トップ画面の初期検索ゲート(ReelFeedのGateOverlay)と同じすりガラスカードの見た目を流用した、
// 正式ローンチ告知用のワンショットモーダル。初回訪問時にだけ出す。
const DISMISS_KEY = "locapass_beta_launch_dismissed";

type Stats = { shops: number; reels: number } | null;

/** 0 から目標の数まで、ゆっくり減速しながら数え上げる。動きを減らす設定のときは、最初から最終値を出す。 */
function CountUp({ to, delay = 0 }: { to: number; delay?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let reduced = false;
    try {
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {}
    if (reduced) {
      setN(to);
      return;
    }
    const duration = 1800;
    const start = performance.now() + delay;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(Math.max((now - start) / duration, 0), 1);
      setN(Math.round(to * (1 - Math.pow(1 - p, 4))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, delay]);
  return <span className="tabular-nums">{n.toLocaleString("ja-JP")}</span>;
}

export function BetaLaunchModal({ stats = null }: { stats?: Stats }) {
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

        <span className="relative whitespace-nowrap rounded-full border border-main/25 bg-main/[0.03] px-4 py-1 text-[11px] font-medium tracking-[0.2em] text-main/70">
          WELCOME LOCAPASS OPEN
        </span>

        <div className="relative flex flex-col gap-1.5 text-[15px] font-light leading-relaxed tracking-[0.2em] text-main/80">
          <span>街がつながる</span>
          <span>人が繋がる</span>
          <span>地域のパスポート</span>
        </div>

        <span className="relative text-3xl font-thin tracking-[0.35em] text-main uppercase">
          LOCAPASS
        </span>

        {stats && (
          <div className="relative flex w-full items-start justify-center gap-0">
            <div className="flex flex-1 flex-col items-center gap-1.5">
              <span className="text-4xl font-thin leading-none tracking-wider text-main">
                <CountUp to={stats.shops} />
              </span>
              <span className="text-[10px] tracking-[0.3em] text-main/50">登録店舗</span>
            </div>
            <div aria-hidden className="h-12 w-px self-center bg-main/20" />
            <div className="flex flex-1 flex-col items-center gap-1.5">
              <span className="text-4xl font-thin leading-none tracking-wider text-main">
                <CountUp to={stats.reels} delay={150} />
              </span>
              <span className="text-[10px] tracking-[0.3em] text-main/50">公開動画</span>
            </div>
          </div>
        )}

        <p className="relative text-[11px] tracking-widest text-main/50">
          正式ローンチ
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
