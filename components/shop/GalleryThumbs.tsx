"use client";

import { useState } from "react";
import { PhotoViewer } from "@/components/CastPhotoGrid";

/**
 * 店舗紹介・イベントのギャラリーのサムネイル。見た目は従来の画像サムネイルのまま、
 * タップするとその写真から始まる全画面の縦スワイプビューアー(リール風)を開く。
 */
export function GalleryThumbs({
  urls,
  alt,
  thumbClassName,
}: {
  urls: string[];
  alt: string;
  /** サムネイル1枚の大きさ・角丸・枠線(従来 img に付けていたクラスから object-cover を除いたもの) */
  thumbClassName: string;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <>
      {urls.map((url, i) => (
        <button
          key={url}
          type="button"
          onClick={() => setOpenIndex(i)}
          aria-label={`${alt} ${i + 1}/${urls.length}`}
          className={`${thumbClassName} overflow-hidden`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" loading="lazy" className="block h-full w-full object-cover" />
        </button>
      ))}

      {openIndex !== null && (
        <PhotoViewer
          photos={urls.map((url) => ({ id: url, url }))}
          initialIndex={openIndex}
          castName={alt}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </>
  );
}
