"use client";

import { Zap, ChevronUp } from "lucide-react";
import { BoostCountdown } from "./BoostCountdown";
import type { BoostItem } from "@/lib/boost/types";
import { limitedLabel, type BoostText } from "@/lib/boost/text";
import { photoResized } from "@/components/photo/photoUtils";

/** 縦スワイプ一覧の1枚。全面に写真、残り時間と要約を重ねる。タップで詳細カードを開く。 */
export function BoostReelItem({ boost, now, t, onOpen }: { boost: BoostItem; now: number; t: BoostText; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="relative block h-full w-full overflow-hidden bg-black text-left md:aspect-[9/16] md:h-full md:w-auto">
      {boost.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoResized(boost.imageUrl, 900, false)} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-black/40" />
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-3 py-1 text-xs font-black text-black">
          <Zap className="h-3.5 w-3.5 fill-black" /> {limitedLabel(t, boost.durationMinutes)}
        </span>
        {boost.discountTag && <span className="rounded-full bg-black/70 px-3 py-1 text-xs font-black text-amber-300">{boost.discountTag}</span>}
      </div>
      <div className="absolute inset-x-0 bottom-0 space-y-2 p-4 pb-6">
        <BoostCountdown expiresAt={boost.expiresAt} now={now} remainLabel={t.remain} />
        <p className="text-sm font-bold text-amber-200">{boost.shop.name}</p>
        <h2 className="text-xl font-black leading-snug text-white">{boost.title}</h2>
        <p className="line-clamp-3 text-sm text-white/80">{boost.description}</p>
        <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-4 py-2 text-xs font-bold text-white backdrop-blur">
          <ChevronUp className="h-4 w-4" /> {t.detail}
        </span>
      </div>
    </button>
  );
}
