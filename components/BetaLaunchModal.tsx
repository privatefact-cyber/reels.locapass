"use client";

import { useEffect, useRef, useState } from "react";

// トップ画面の初期検索ゲート(ReelFeedのGateOverlay)と同じすりガラスカードの見た目を流用した、
// 正式ローンチ告知用のワンショットモーダル。初回訪問時にだけ出す。
const DISMISS_KEY = "locapass_beta_launch_dismissed";

type Stats = { shops: number; reels: number } | null;

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

/** 数字が「カカカッ」と切り替わる、機械式カウンターの動き。桁ごとに縦にロールし、整数の間は素早く切り替わって、次の数字まではほぼ止まる。 */
function snapRoll(pos: number) {
  const base = Math.floor(pos);
  const frac = pos - base;
  const t = Math.min(Math.max((frac - 0.3) / 0.45, 0), 1);
  return (base % 10) + t * t * (3 - 2 * t);
}

/**
 * 機械式(空港のフラップ表示のような)カウンター。各桁が独立して縦に高速で回り、左の桁から順に、最終値で「ピタッ」と止まる。
 *  - 最初は0から。右の桁ほど多く回り、止まるのも遅い。全体で約2秒(delay の分だけ遅れて始まる)。
 *  - 目標の数が変わったら(登録が増えたとき)、いま表示している数字から短く回して合わせる。
 *  - 全部止まった瞬間に、数字をほんの一瞬だけ明るくして、すぐ通常の白へ戻す。
 *  - 動きを減らす設定のときは、回さずに最終値をそのまま出す。
 */
function Odometer({ to, delay = 0 }: { to: number; delay?: number }) {
  const text = String(Math.max(0, Math.trunc(to)));
  const n = text.length;
  const [y, setY] = useState<number[]>([]);
  const [phase, setPhase] = useState<"spin" | "flash" | "idle">("spin");
  // 右端の桁を 0 として、桁ごとの「いまの位置」(回転量)を持つ。目標が変わっても、いまの数字から続けられる。
  const cur = useRef<number[]>([]);
  const first = useRef(true);

  useEffect(() => {
    const digits = text.split("").map(Number);
    const isFirst = first.current;
    first.current = false;
    let reduced = false;
    try {
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {}
    if (reduced) {
      digits.forEach((d, c) => (cur.current[n - 1 - c] = d));
      setY(digits);
      setPhase("idle");
      return;
    }

    setPhase("spin");
    const t0 = performance.now() + (isFirst ? delay : 0);
    const plan = digits.map((target, c) => {
      const from = cur.current[n - 1 - c] ?? 0;
      const laps = isFirst ? 1 + c : 1;
      const move = ((target - (from % 10)) % 10 + 10) % 10 + 10 * laps;
      return { from, move, duration: isFirst ? 1500 + c * 220 : 900 };
    });
    let raf = 0;
    let timer = 0;
    const tick = (now: number) => {
      let done = true;
      const next = plan.map((pl, c) => {
        const p = Math.min(Math.max((now - t0) / pl.duration, 0), 1);
        if (p < 1) done = false;
        // 最初は速く、止まる直前に減速する。
        const pos = p >= 1 ? Math.round(pl.from + pl.move) : pl.from + pl.move * (1 - Math.pow(1 - p, 2.2));
        cur.current[n - 1 - c] = pos;
        return snapRoll(pos);
      });
      setY(next);
      if (!done) {
        raf = requestAnimationFrame(tick);
        return;
      }
      setPhase("flash");
      timer = window.setTimeout(() => setPhase("idle"), 160);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [text, n, delay]);

  return (
    <span
      role="img"
      aria-label={to.toLocaleString("ja-JP")}
      className={`inline-flex origin-bottom scale-y-[1.12] ${
        phase === "spin"
          ? "opacity-80"
          : phase === "flash"
            ? "opacity-100 brightness-150"
            : "opacity-100 transition-[opacity,filter] duration-300"
      }`}
    >
      {Array.from({ length: n }, (_, c) => (
        <span key={c} aria-hidden className="inline-block h-[1em] w-[0.56em] overflow-hidden text-center leading-none tabular-nums">
          <span className="block will-change-transform" style={{ transform: `translateY(-${(y[c] ?? 0) * 1}em)` }}>
            {DIGITS.map((d, i) => (
              <span key={i} className="block h-[1em] leading-none">
                {d}
              </span>
            ))}
          </span>
        </span>
      ))}
    </span>
  );
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
              <span className="text-[2.6rem] font-thin leading-none text-main">
                <Odometer to={stats.shops} />
              </span>
              <span className="text-[9px] tracking-[0.3em] text-main/50">登録店舗</span>
            </div>
            <div aria-hidden className="h-12 w-px self-center bg-main/20" />
            <div className="flex flex-1 flex-col items-center gap-1.5">
              <span className="text-[2.6rem] font-thin leading-none text-main">
                <Odometer to={stats.reels} delay={260} />
              </span>
              <span className="text-[9px] tracking-[0.3em] text-main/50">公開動画</span>
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

        {/* 店舗向けの掲載案内(静的LP)へ。内部の静的ページなので、通常のリンクで開く。 */}
        <a
          href="/lp/shop"
          className="relative -mt-2 text-[11px] tracking-[0.15em] text-main/60 underline decoration-main/30 underline-offset-4 transition hover:text-main/90 hover:decoration-main/60"
        >
          掲載のお問い合わせはこちら
        </a>
      </div>
    </div>
  );
}
