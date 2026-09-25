"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { sanitizeImageUrl } from "@/lib/utils/sanitize-image-url";

type Photo = { id: string; url: string };

/**
 * プロフィールの「写真」グリッド。タップすると、その写真から始まる
 * 全画面の縦スワイプビューアー(リール風)を開く。
 */
export function CastPhotoGrid({ photos, castName }: { photos: Photo[]; castName: string }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <>
      <div className="grid grid-cols-3 gap-[1px] sm:landscape:grid-cols-4 sm:portrait:grid-cols-6 md:landscape:grid-cols-6 md:gap-[2px] md:max-w-7xl md:mx-auto lg:landscape:grid-cols-8">
        {photos.map((m, i) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setOpenIndex(i)}
            className="aspect-square w-full"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sanitizeImageUrl(m.url)} alt={castName} loading="lazy" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>

      {openIndex !== null && (
        <PhotoViewer
          photos={photos}
          initialIndex={openIndex}
          castName={castName}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </>
  );
}

export function PhotoViewer({
  photos,
  initialIndex,
  castName,
  onClose,
}: {
  photos: Photo[];
  initialIndex: number;
  castName: string;
  onClose: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);

  // 開いた瞬間に、タップした写真の位置まで一気にスクロールしておく
  // (スナップ済みのDOMにマウントされるのでアニメーションは不要)。
  const scrollerRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      const target = node.children[initialIndex] as HTMLElement | undefined;
      target?.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "start" });
    },
    [initialIndex],
  );

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const node = e.currentTarget;
    const index = Math.round(node.scrollTop / node.clientHeight);
    setActiveIndex(index);
  };

  // body直下に描画する。横スクロールのギャラリー等の中に置くと、iPhone Safariでは
  // 全画面(fixed)がその枠の中に閉じ込められ、下の要素に隠れてしまうため。
  return createPortal(
    <div data-surface="media" className="fixed inset-0 z-[100] bg-black">
      <button
        type="button"
        onClick={onClose}
        aria-label="閉じる"
        className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-main"
      >
        <X size={20} />
      </button>

      <span className="absolute left-3 top-3 z-10 rounded bg-black/60 px-2 py-1 text-xs text-main">
        {activeIndex + 1} / {photos.length}
      </span>

      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="h-full w-full snap-y snap-mandatory overflow-y-auto"
      >
        {photos.map((m) => (
          <div key={m.id} className="flex h-full w-full snap-start snap-always items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sanitizeImageUrl(m.url)} alt={castName} className="max-h-full max-w-full object-contain" />
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
