"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** ドロワーが止まる高さ(画面高さに対する割合)。1/3 → 1/2。 */
const SNAPS = [1 / 3, 1 / 2];
const CLOSE_BELOW = 0.2;

/**
 * リール投稿の全文を表示する、下からのドロワー。
 * 上部のハンドルを引っ張ると 1/3 → 1/2 の2段階で止まり、
 * 下へ引き下げると閉じる。全文が入りきらない場合は本文をスクロールする。
 */
export function CaptionDrawer({ caption, onClose, zIndex }: { caption: string; onClose: () => void; zIndex?: number }) {
  const [snapIndex, setSnapIndex] = useState(0);
  const [viewportH, setViewportH] = useState(0);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const [entered, setEntered] = useState(false);
  const drag = useRef<{ startY: number; startHeight: number; lastY: number; lastT: number; v: number; moved: boolean } | null>(null);

  useEffect(() => {
    const update = () => setViewportH(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => {
      window.removeEventListener("resize", update);
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const snapHeights = SNAPS.map((s) => s * viewportH);
  const height = dragHeight ?? snapHeights[snapIndex];

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startHeight: height, lastY: e.clientY, lastT: e.timeStamp, v: 0, moved: false };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const dy = d.startY - e.clientY;
    if (Math.abs(dy) > 4) d.moved = true;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.v = (d.lastY - e.clientY) / dt; // 上向きが正(px/ms)
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    setDragHeight(Math.min(Math.max(d.startHeight + dy, 0), snapHeights[SNAPS.length - 1]));
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    // タップ(ほぼ動いていない): 次の段階へ。最大まで開いていたら閉じる。
    if (!d.moved) {
      setDragHeight(null);
      if (snapIndex >= SNAPS.length - 1) onClose();
      else setSnapIndex(snapIndex + 1);
      return;
    }
    const h = dragHeight ?? d.startHeight;
    // 勢いのあるフリックは、その向きに1段階進める。
    const projected = h + d.v * 150;
    if (projected < CLOSE_BELOW * viewportH) {
      onClose();
      return;
    }
    let nearest = 0;
    for (let i = 1; i < snapHeights.length; i++) {
      if (Math.abs(snapHeights[i] - projected) < Math.abs(snapHeights[nearest] - projected)) nearest = i;
    }
    setDragHeight(null);
    setSnapIndex(nearest);
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 backdrop-blur-[2px]"
      style={zIndex ? { zIndex } : undefined}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          height: entered ? height : 0,
          transition: dragHeight === null ? "height 220ms cubic-bezier(0.2, 0.8, 0.2, 1)" : "none",
        }}
        className="flex w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-main/20 bg-surface/90 shadow-2xl shadow-black/50 backdrop-blur-2xl backdrop-saturate-150"
      >
        {/* 引っ張るところ(ハンドル)。ここを上下にドラッグして高さを変える。 */}
        <div
          role="button"
          tabIndex={0}
          aria-label="ドロワーの高さを変える"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="flex shrink-0 cursor-grab touch-none items-center justify-center py-3 active:cursor-grabbing"
        >
          <span className="h-1.5 w-12 rounded-full bg-main/40" />
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-main">{caption}</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
