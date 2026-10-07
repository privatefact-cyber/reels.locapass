"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";

// 横スクロールできる要素(動画帯・丸アイコン列・ギャラリー等)の上で始まったスワイプは
// その要素自身のスクロールに任せ、ページ遷移には使わない。
function startsInsideHorizontalScroller(target: EventTarget | null): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body) {
    if (el instanceof HTMLElement) {
      if (el.dataset.noSwipe !== undefined) return true;
      if (el.scrollWidth > el.clientWidth + 1) {
        const overflowX = getComputedStyle(el).overflowX;
        if (overflowX === "auto" || overflowX === "scroll") return true;
      }
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * 店舗詳細ページ全体を「横スワイプ → 動画ストック(過去動画)ページ」にするラッパー。
 * 縦スクロールとの取り違えを避けるため、横移動が十分大きく縦移動の2倍以上のときだけ反応する。
 * 見た目には影響しない(display: contents)。リンクからも行けるので、スワイプは近道の位置づけ。
 */
export function ShopSwipeToArchive({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const start = useRef<{ x: number; y: number; t: number } | null>(null);

  return (
    <div
      className="contents"
      onTouchStart={(e) => {
        const touch = e.touches[0];
        start.current =
          e.touches.length === 1 && !startsInsideHorizontalScroller(e.target)
            ? { x: touch.clientX, y: touch.clientY, t: Date.now() }
            : null;
      }}
      onTouchEnd={(e) => {
        const s = start.current;
        start.current = null;
        if (!s) return;
        const touch = e.changedTouches[0];
        const dx = touch.clientX - s.x;
        const dy = touch.clientY - s.y;
        if (Math.abs(dx) < 90 || Math.abs(dx) < Math.abs(dy) * 2 || Date.now() - s.t > 700) return;
        // 右から左の言語(アラビア語)では進む方向が逆になる。
        const rtl = document.documentElement.dir === "rtl";
        if (rtl ? dx > 0 : dx < 0) router.push(href);
      }}
      onTouchCancel={() => {
        start.current = null;
      }}
    >
      {children}
    </div>
  );
}
