"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { PhotoPost } from "@/lib/photo/getPhotoPosts";
import { photoResized } from "@/components/photo/photoUtils";
import { PhotoDeleteButton } from "@/components/photo/PhotoDeleteButton";
import { useLocale } from "@/components/i18n/LocaleProvider";

/**
 * 写真のフルスクリーン表示。縦スワイプのビューアの上に、画面全体を黒で覆って1枚をいっぱいに出す。
 * 親の枠に閉じ込められないようdocument.body直下に描く(iPhone Safariでfixedが枠内に収まる問題の回避)。
 * 閉じる: ×ボタン / 写真以外のタップ / Escキー。前後の写真: 矢印ボタン / 左右キー / 左右スワイプ。
 */
export function PhotoFullscreen({
  posts,
  index,
  onIndexChange,
  onClose,
  onDeleted,
}: {
  posts: PhotoPost[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** 渡すと、投稿者本人とルート管理者にだけ削除ボタンが出る。削除後に呼ばれる。 */
  onDeleted?: (postId: string) => void;
}) {
  const { t } = useLocale();
  const touchStartX = useRef<number | null>(null);
  const post = posts[index];

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
      if (e.key === "ArrowRight" && index < posts.length - 1) onIndexChange(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [index, posts.length, onClose, onIndexChange]);

  if (!post || typeof document === "undefined") return null;

  const arrow =
    "absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={post.spotName}
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black"
      onClick={onClose}
      onTouchStart={(e) => (touchStartX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        const start = touchStartX.current;
        touchStartX.current = null;
        if (start === null) return;
        const dx = e.changedTouches[0].clientX - start;
        if (Math.abs(dx) < 60) return;
        if (dx < 0 && index < posts.length - 1) onIndexChange(index + 1);
        if (dx > 0 && index > 0) onIndexChange(index - 1);
      }}
    >
      {/* 上端はノッチ/ステータスバーに隠れないよう、セーフエリア分だけ下げる */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label={t.photo.close}
        className="absolute right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur"
        style={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
      >
        <X size={22} />
      </button>

      {onDeleted ? <PhotoDeleteButton post={post} onDeleted={onDeleted} variant="icon" /> : null}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoResized(post.imageUrl, 1920, false)}
        alt={post.spotName}
        className="max-h-full max-w-full object-contain"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />

      {index > 0 ? (
        <button
          type="button"
          aria-label={t.photo.prevPhoto}
          className={`${arrow} left-3`}
          onClick={(e) => {
            e.stopPropagation();
            onIndexChange(index - 1);
          }}
        >
          <ChevronLeft size={24} />
        </button>
      ) : null}
      {index < posts.length - 1 ? (
        <button
          type="button"
          aria-label={t.photo.nextPhoto}
          className={`${arrow} right-3`}
          onClick={(e) => {
            e.stopPropagation();
            onIndexChange(index + 1);
          }}
        >
          <ChevronRight size={24} />
        </button>
      ) : null}

      <p
        className="pointer-events-none absolute inset-x-0 text-center text-xs text-white/80"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
      >
        {post.spotName}
        {posts.length > 1 ? `　${index + 1} / ${posts.length}` : ""}
      </p>
    </div>,
    document.body,
  );
}
