"use client";

import { memo } from "react";
import type { PortalEvent } from "@/lib/types/shop";

/** イベント一覧のタイル。ランキング(RankingFeed)のタイルと同じ正方形・同じ文字組み。 */
export const EventGridCard = memo(function EventGridCard({
  event,
  index,
  onOpen,
}: {
  event: PortalEvent;
  index: number;
  onOpen: (index: number) => void;
}) {
  return (
    <button data-surface="media"
      type="button"
      onClick={() => onOpen(index)}
      className="group relative block aspect-square w-full overflow-hidden rounded-none bg-panel-900 text-left"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={event.imageUrl}
        alt=""
        loading="lazy"
        className="h-full w-full transform-gpu object-cover transition duration-300 will-change-transform group-hover:scale-105 group-hover:brightness-110"
      />

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/5 to-transparent" />

      <span className="pointer-events-none absolute inset-x-0 bottom-0 px-2 pb-1.5 pt-4">
        <span className="block truncate text-[11px] font-semibold text-main drop-shadow">{event.title}</span>
        <span className="block truncate text-[10px] text-main/70">{event.shopName}</span>
      </span>
    </button>
  );
});
