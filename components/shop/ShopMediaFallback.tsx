"use client";

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
      {pick && showCredit && (
        <a
          data-surface="media"
          href={pick.creditUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute right-3 top-3 z-20 rounded bg-black/55 px-1.5 py-0.5 text-[9px] leading-none text-main/80 backdrop-blur-sm hover:text-main sm:right-6 sm:top-6"
        >
          イメージ ・ {pick.credit} / {pick.source}
        </a>
      )}
    </>
  );
}
