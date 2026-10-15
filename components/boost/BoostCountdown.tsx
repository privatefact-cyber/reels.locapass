"use client";

import { useEffect, useState } from "react";

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function formatRemain(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  // 1時間以上は 時:分:秒(2時間のブーストが「119:47」のように見えないように)。
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** 残り時間のカウントダウン。5分を切ると赤く点滅して緊急感を出す。 */
export function BoostCountdown({ expiresAt, now, remainLabel }: { expiresAt: string; now: number; remainLabel: string }) {
  const left = new Date(expiresAt).getTime() - now;
  const urgent = left < 5 * 60 * 1000;
  return (
    <div className="flex items-baseline gap-2" aria-live="off">
      <span className="text-xs font-bold text-white/80">{remainLabel}</span>
      <span
        className={`font-mono text-4xl font-black tabular-nums leading-none ${urgent ? "animate-pulse text-red-400" : "text-amber-300"}`}
      >
        {formatRemain(left)}
      </span>
    </div>
  );
}
