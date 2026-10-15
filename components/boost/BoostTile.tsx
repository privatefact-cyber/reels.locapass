"use client";

import Link from "next/link";
import { Zap } from "lucide-react";
import { formatRemain } from "./BoostCountdown";
import type { BoostItem } from "@/lib/boost/types";
import type { BoostText } from "@/lib/boost/text";
import { photoResized } from "@/components/photo/photoUtils";

/** 一覧グリッドの1マス。残り時間をバッジで常時表示し、タップで詳細へ。 */
export function BoostTile({ boost, now, t }: { boost: BoostItem; now: number; t: BoostText }) {
  const left = new Date(boost.expiresAt).getTime() - now;
  const ended = left <= 0;
  const urgent = left < 5 * 60 * 1000;
  return (
    <Link
      href={`/boost/${boost.id}`}
      className={`relative block aspect-[3/4] overflow-hidden rounded-xl bg-zinc-900 ring-1 ring-amber-400/30 transition-opacity duration-700 ${ended ? "opacity-40" : ""}`}
    >
      {boost.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoResized(boost.imageUrl, 420, true)} alt={boost.title} loading="lazy" className="h-full w-full object-cover" />
      )}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-1 bg-gradient-to-b from-black/80 to-transparent p-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-sm font-black tabular-nums ${
            ended ? "bg-zinc-700 text-white" : urgent ? "animate-pulse bg-red-500 text-white" : "bg-amber-400 text-black"
          }`}
        >
          <Zap className="h-3.5 w-3.5 fill-current" />
          {ended ? t.ended : formatRemain(left)}
        </span>
        {boost.discountTag && <span className="max-w-[55%] truncate rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-black text-amber-300">{boost.discountTag}</span>}
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent p-2.5 pt-10">
        <p className="truncate text-[11px] font-bold text-amber-200">{boost.shop.name}</p>
        <p className="line-clamp-2 text-sm font-black leading-snug text-white">{boost.title}</p>
      </div>
    </Link>
  );
}
