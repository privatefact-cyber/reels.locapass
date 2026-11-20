"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * 広告カードの横スライド。カードが2枚以上のときは、一定の間隔で次のカードへ自動で送る(最後まで行ったら最初に戻る)。
 * 触っている間と、その後しばらくは止める。動きを減らす設定(prefers-reduced-motion)のときは自動で送らない。
 * 子要素(カード)は data-ad-card を付けて渡す。
 */
export function AdCarousel({ children, count, intervalMs = 5000 }: { children: ReactNode; count: number; intervalMs?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const pausedUntil = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || count < 2) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const pause = () => {
      pausedUntil.current = Date.now() + 10_000;
    };
    el.addEventListener("pointerdown", pause);
    el.addEventListener("wheel", pause, { passive: true });
    el.addEventListener("touchstart", pause, { passive: true });
    const timer = window.setInterval(() => {
      if (document.hidden || Date.now() < pausedUntil.current) return;
      const cards = Array.from(el.querySelectorAll<HTMLElement>("[data-ad-card]"));
      if (cards.length < 2) return;
      // 画面の外にあるときは動かさない(読んでいる最中にページがずれないように、横方向だけ送る)。
      const rect = el.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;
      const current = cards.findIndex((c) => c.offsetLeft - el.offsetLeft >= el.scrollLeft - 4);
      const next = current < 0 || current >= cards.length - 1 ? 0 : current + 1;
      el.scrollTo({ left: cards[next].offsetLeft - cards[0].offsetLeft, behavior: "smooth" });
    }, intervalMs);
    return () => {
      window.clearInterval(timer);
      el.removeEventListener("pointerdown", pause);
      el.removeEventListener("wheel", pause);
      el.removeEventListener("touchstart", pause);
    };
  }, [count, intervalMs]);

  return (
    <div
      ref={ref}
      className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ scrollPaddingLeft: 16 }}
    >
      {children}
    </div>
  );
}
