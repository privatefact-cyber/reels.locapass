"use client";

import { useEffect, useState } from "react";
import { AutoplayVideo } from "@/components/portal/AutoplayVideo";
import { pickPlaceholder } from "@/lib/placeholders/pick";

/**
 * 店舗の写真/動画が無い・読み込めないときに、親要素いっぱい(absolute inset-0)に敷くダミー。
 * Pixabayのイメージ写真/動画があればそれを、無ければ店名の頭文字入りのグラデーションを出す(真っ黒にしない)。
 * 店舗が自前の写真を設定すれば使われなくなる。イメージであることは小さく明記する。
 */
export function ShopMediaFallback({
  category,
  seed,
  name,
  allowVideo = false,
  showCredit = true,
}: {
  category: string | null | undefined;
  seed: string;
  name: string;
  allowVideo?: boolean;
  showCredit?: boolean;
}) {
  const pick = pickPlaceholder(category, seed, { allowVideo });
  const initial = name.trim().slice(0, 1) || "L";

  return (
    <>
      {pick?.kind === "video" ? (
        <AutoplayVideo src={pick.url} />
      ) : pick?.kind === "photo" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pick.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-gradient-to-br from-hl-900/70 via-tone-900 to-black">
          <span className="font-display select-none text-[8rem] font-bold leading-none text-main/[0.06]">{initial}</span>
        </div>
      )}
      {pick && showCredit && <ImageNotice credit={pick.credit} creditUrl={pick.creditUrl} source={pick.source} />}
    </>
  );
}

/**
 * 「これはイメージ画像です」の控えめな表示。普段は小さな丸い「i」だけで、タップすると説明(撮影者と出所)が出る。
 * 実際の店舗の写真だと誤解されないための表記なので、消さずに目立たなくしている。
 */
function ImageNotice({ credit, creditUrl, source }: { credit: string; creditUrl: string; source: string }) {
  const [open, setOpen] = useState(false);
  // 開いたまま放置されないよう、数秒で閉じる。
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => setOpen(false), 5000);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <div data-surface="media" className="absolute right-3 top-3 z-20 flex flex-col items-end gap-1 sm:right-6 sm:top-6">
      <button
        type="button"
        aria-label="イメージ画像について"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-5 w-5 items-center justify-center rounded-full border border-main/30 bg-black/35 font-serif text-[11px] italic leading-none text-main/70 backdrop-blur-sm transition hover:text-main"
      >
        i
      </button>
      {open && (
        <a
          href={creditUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="whitespace-nowrap rounded bg-black/70 px-2 py-1 text-[10px] leading-none text-main/90 backdrop-blur-sm"
        >
          イメージ画像です ・ 撮影: {credit} / {source}
        </a>
      )}
    </div>
  );
}
