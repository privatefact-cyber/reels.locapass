"use client";

import { useEffect } from "react";

/** キャプションが長いリール投稿の「続きを読む」で開く、すりガラス背景+白文字のモーダル。 */
export function ReadMoreCaptionModal({
  caption,
  onClose,
}: {
  caption: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[70vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-white/20 bg-white/10 p-5 shadow-2xl shadow-black/40 backdrop-blur-2xl backdrop-saturate-150"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="float-right text-white/70 hover:text-white"
        >
          ✕
        </button>
        <p className="whitespace-pre-wrap pt-8 text-sm leading-relaxed text-white">{caption}</p>
      </div>
    </div>
  );
}
