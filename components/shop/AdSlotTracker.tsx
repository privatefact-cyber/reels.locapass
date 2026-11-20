"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** 広告枠の表示(画面に半分以上入ったとき1回)とタップを、/api/ad-event に送る。失敗しても画面には影響しない。 */
export function AdSlotTracker({ slot, creative, shopId, locale, children }: { slot: "mid" | "bottom"; creative: string; shopId: string; locale: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const sent = useRef(false);
  const send = (kind: "imp" | "tap") => {
    try {
      const body = JSON.stringify({ slot, creative, kind, shopId, locale });
      if (!navigator.sendBeacon?.("/api/ad-event", new Blob([body], { type: "application/json" }))) {
        void fetch("/api/ad-event", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } });
      }
    } catch {}
  };
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!sent.current && entries.some((e) => e.isIntersecting)) {
          sent.current = true;
          send("imp");
          io.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div ref={ref} onClickCapture={() => send("tap")}>
      {children}
    </div>
  );
}
