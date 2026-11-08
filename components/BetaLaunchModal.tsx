"use client";

import { useEffect, useRef, useState } from "react";

// トップ画面の初期検索ゲート(ReelFeedのGateOverlay)と同じすりガラスカードの見た目を流用した、
// 正式ローンチ告知用のワンショットモーダル。初回訪問時にだけ出す。
const DISMISS_KEY = "locapass_beta_launch_dismissed";

type Stats = { shops: number; reels: number } | null;

/**
 * いま表示している数から目標の数まで、ゆっくり減速しながら数え上げる(最初は0から)。
 * 目標が変わったら、そこから続けて動くので、登録が増えるとその場で数字が増える。動きを減らす設定のときは、すぐ最終値にする。
 */
function CountUp({ to, delay = 0 }: { to: number; delay?: number }) {
  const [n, setN] = useState(0);
  const shown = useRef(0);
  const first = useRef(true);
  useEffect(() => {
    let reduced = false;
    try {
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {}
    if (reduced) {
      shown.current = to;
      setN(to);
      return;
    }
    const from = shown.current;
    const duration = first.current ? 1800 : 1200;
    const start = performance.now() + (first.current ? delay : 0);
    first.current = false;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(Math.max((now - start) / duration, 0), 1);
      const value = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 4)));
      shown.current = value;
      setN(value);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, delay]);
  return <span className="tabular-nums">{n.toLocaleString("ja-JP")}</span>;
}

export function BetaLaunchModal({ stats: initialStats = null }: { stats?: Stats }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [stats, setStats] = useState<Stats>(initialStats);

  // モーダルを開いている間は、30秒ごとに最新の件数を取り直す。登録が増えていたら、カウンターがその場で増える。
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await fetch("/api/launch-stats", { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as { shops?: unknown; reels?: unknown };
        if (!cancelled && typeof next.shops === "number" && typeof next.reels === "number") setStats({ shops: next.shops, reels: next.reels });
      } catch {}
    };
    void refresh();
    const id = window.setInterval(refresh, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [open]);

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
