"use client";

import { memo, useState } from "react";
import { Zap } from "lucide-react";
import { formatRemain } from "./BoostCountdown";
import type { BoostItem } from "@/lib/boost/types";
import { gridThumb } from "@/lib/images/thumb";

/** トップのグリッド(GridTile)と同じ正方形タイル。左上に残り時間のタイマーバッジを重ねる。 */
export const BoostTile = memo(function BoostTile({
  boost,
  index,
  now,
  endedLabel,
  onOpen,
}: {
  boost: BoostItem;
  index: number;
  now: number;
  endedLabel: string;
  onOpen: (index: number) => void;
}) {
  const thumb = gridThumb(boost.imageUrl ?? undefined);
  const [broken, setBroken] = useState(false);
  const left = new Date(boost.expiresAt).getTime() - now;
  const ended = left <= 0;
  const urgent = left < 5 * 60 * 1000;
  return (
    <button
      data-surface="media"
      type="button"
      onClick={() => onOpen(index)}
      className={`group relative block aspect-square w-full overflow-hidden rounded-none bg-panel-900 text-left transition-opacity duration-700 ${ended ? "opacity-40" : ""}`}
    >
      {thumb && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          onError={() => setBroken(true)}
          src={thumb}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full transform-gpu object-cover transition duration-300 will-change-transform group-hover:scale-105 group-hover:brightness-110"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-tone-800 via-tone-950 to-black">
          <span className="font-display text-xs uppercase tracking-[0.2em] text-accent/50">LOCAPASS</span>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/5 to-transparent" />
      <span
        className={`pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono text-[11px] font-black tabular-nums ${
          ended ? "bg-zinc-700 text-white" : urgent ? "animate-pulse bg-red-500 text-white" : "bg-amber-400 text-black"
        }`}
      >
        <Zap size={10} className="fill-current" />
        {ended ? endedLabel : formatRemain(left)}
      </span>
      {boost.discountTag && (
        <span className="pointer-events-none absolute right-1.5 top-1.5 max-w-[60%] truncate rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
          {boost.discountTag}
        </span>
      )}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 px-2 pb-1.5 pt-4">
        <span dir="auto" className="block truncate text-[11px] font-semibold text-main drop-shadow">
          {boost.shop.name}
        </span>
        <span dir="auto" className="block truncate text-[10px] text-main/70">{boost.title}</span>
      </span>
    </button>
  );
});
